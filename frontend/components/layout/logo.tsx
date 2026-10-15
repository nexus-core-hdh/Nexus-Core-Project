import Image from "next/image";

/**
 * Nexus Core mark (the "N" + document emblem) for the sidebar header. The artwork has a white
 * background with a white document inside it, so it sits on its own white rounded tile rather
 * than being made transparent against the dark sidebar.
 */
export default function Logo() {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white transition-all group-data-[collapsible=icon]:size-8">
      <Image
        src="/brand/nexus-core-mark.png"
        width={36}
        height={36}
        className="size-full object-contain"
        alt="Nexus Core"
        unoptimized
      />
    </span>
  );
}
