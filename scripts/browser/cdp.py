"""A tiny driver for headless Edge over the DevTools protocol: go, type, click, wait, screenshot, PDF."""

import base64
import json
import subprocess
import tempfile
import time
import urllib.request

import websocket

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

SET_VALUE = """
(function (el, value) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
    : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  return true;
})
"""


class Browser:
    def __init__(self, port: int = 0) -> None:
        if not port:
            import socket
            with socket.socket() as probe:
                probe.bind(("127.0.0.1", 0))
                port = probe.getsockname()[1]
        self.profile = tempfile.mkdtemp(prefix="edge-cdp-")
        self.proc = subprocess.Popen([
            EDGE, "--headless=new", f"--remote-debugging-port={port}", f"--user-data-dir={self.profile}",
            "--no-first-run", "--disable-gpu", "--remote-allow-origins=*", "about:blank",
        ])
        tabs = None
        for _ in range(100):
            try:
                tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json"))
                if any(tab["type"] == "page" for tab in tabs):
                    break
            except OSError:
                pass
            time.sleep(0.2)
        if not tabs:
            raise RuntimeError(f"Edge did not open its DevTools port {port}")
        page = next(tab for tab in tabs if tab["type"] == "page")
        self.ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=180)
        self.next_id = 0
        self.send("Page.enable")
        self.send("Runtime.enable")

    def send(self, method: str, **params):
        self.next_id += 1
        self.ws.send(json.dumps({"id": self.next_id, "method": method, "params": params}))
        while True:
            message = json.loads(self.ws.recv())
            if message.get("id") == self.next_id:
                if "error" in message:
                    raise RuntimeError(f"{method}: {message['error']}")
                return message.get("result", {})

    def size(self, width: int, height: int) -> None:
        self.send("Emulation.setDeviceMetricsOverride", width=width, height=height, deviceScaleFactor=1,
                  mobile=width < 500)

    def go(self, url: str) -> None:
        self.send("Page.navigate", url=url)
        time.sleep(0.5)

    def js(self, expression: str):
        result = self.send("Runtime.evaluate", expression=expression, awaitPromise=True, returnByValue=True)
        if "exceptionDetails" in result:
            raise RuntimeError(result["exceptionDetails"])
        return result["result"].get("value")

    def text(self) -> str:
        return self.js("document.body.innerText") or ""

    def wait_text(self, wanted: str, timeout: float = 90) -> float:
        started = time.monotonic()
        while time.monotonic() - started < timeout:
            if wanted.lower() in self.text().lower():
                return time.monotonic() - started
            time.sleep(0.25)
        raise TimeoutError(f"'{wanted}' did not appear. Page says: {self.text()[:1500]}")

    def click(self, label: str, tag: str = "button, a") -> None:
        found = self.js(f"""(() => {{
            const items = [...document.querySelectorAll({json.dumps(tag)})];
            const el = items.find(e => e.innerText.trim() === {json.dumps(label)})
                    || items.find(e => e.innerText.trim().startsWith({json.dumps(label)}));
            if (!el) return false;
            el.scrollIntoView({{block: 'center'}});
            el.click();
            return true;
        }})()""")
        if not found:
            raise RuntimeError(f"nothing to click called '{label}'")
        time.sleep(0.3)

    def fill(self, selector: str, value) -> None:
        ok = self.js(f"({SET_VALUE})(document.querySelector({json.dumps(selector)}), {json.dumps(str(value))})")
        if not ok:
            raise RuntimeError(f"no field {selector}")

    def fill_labelled(self, label: str, value) -> None:
        """The field whose <label> text starts with `label`."""
        ok = self.js(f"""(() => {{
            const label = [...document.querySelectorAll('label')].find(l => l.innerText.trim().toLowerCase().startsWith({json.dumps(label.lower())}));
            if (!label) return false;
            const el = label.htmlFor ? document.getElementById(label.htmlFor) : label.querySelector('input,textarea,select');
            return ({SET_VALUE})(el, {json.dumps(str(value))});
        }})()""")
        if not ok:
            raise RuntimeError(f"no field labelled {label}")

    def wider_than_screen(self) -> int:
        return self.js("document.documentElement.scrollWidth - window.innerWidth")

    def shot(self, path: str, full: bool = False) -> None:
        params = {"format": "png"}
        if full:
            metrics = self.send("Page.getLayoutMetrics")["cssContentSize"]
            params.update(captureBeyondViewport=True, clip={
                "x": 0, "y": 0, "width": metrics["width"], "height": min(metrics["height"], 6000), "scale": 1,
            })
        data = self.send("Page.captureScreenshot", **params)["data"]
        with open(path, "wb") as out:
            out.write(base64.b64decode(data))

    def pdf(self, path: str) -> None:
        data = self.send("Page.printToPDF", preferCSSPageSize=True, printBackground=False)["data"]
        with open(path, "wb") as out:
            out.write(base64.b64decode(data))

    def close(self) -> None:
        try:
            self.ws.close()
        finally:
            subprocess.run(["taskkill", "/PID", str(self.proc.pid), "/T", "/F"], capture_output=True)
