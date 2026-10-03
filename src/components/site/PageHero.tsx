type Props = {
  image: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  minHeight?: string;
  /** Vertical padding around the text (the homepage's shorter hero uses less). */
  paddingY?: string;
};

export function PageHero({
  image,
  eyebrow,
  title,
  subtitle,
  children,
  minHeight = "min-h-[60vh]",
  paddingY = "py-20",
}: Props) {
  return (
    <section className={`relative isolate flex ${minHeight} items-center overflow-hidden`}>
      <img
        src={image}
        alt=""
        className="absolute inset-0 -z-10 h-full w-full object-cover"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/70 via-background/60 to-background" />
      <div className={`mx-auto w-full max-w-5xl px-4 ${paddingY} text-center md:px-6`}>
        {eyebrow && (
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
            {eyebrow}
          </div>
        )}
        <h1 className="text-4xl leading-tight md:text-6xl">{title}</h1>
        {subtitle && (
          <p className="mx-auto mt-5 max-w-2xl text-base text-foreground/85 md:text-lg">
            {subtitle}
          </p>
        )}
        {children && <div className="mt-7 flex flex-wrap justify-center gap-3">{children}</div>}
      </div>
    </section>
  );
}
