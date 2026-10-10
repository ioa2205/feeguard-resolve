// The "Not built yet" sheet of DESIGN section 9. Never a blank page, never a fake screen.

interface Props {
  title: string
  /** The sentence under the title: what this screen is for (DESIGN section 8.3). */
  sentence: string
  /** What the screen will show. */
  will: string
  task: string
}

export function NotBuilt({ title, sentence, will, task }: Props) {
  return (
    <>
      <h1 className="font-condensed text-title font-semibold">{title}</h1>
      <p className="mb-6 max-w-[70ch]">{sentence}</p>
      <section className="border-line bg-sheet rounded-sheet max-w-[70ch] border p-6">
        <h2 className="font-condensed text-label mb-2 font-semibold tracking-[0.06em]">NOT BUILT YET</h2>
        <p>{will}</p>
        <p className="text-ink-soft text-small mt-4">Task {task} in the plan builds this screen.</p>
      </section>
    </>
  )
}
