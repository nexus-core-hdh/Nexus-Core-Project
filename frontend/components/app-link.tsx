"use client";

import * as React from "react";
import NextLink from "next/link";

import { useCompanySlug } from "@/lib/app-navigation";
import { withCompanySlug } from "@/lib/company-path";

type LinkProps = React.ComponentProps<typeof NextLink>;

/**
 * `next/link` for app paths: `href="/plm/x"` renders `/{company-slug}/plm/x`. Non-app hrefs
 * (guest pages, external URLs, anchors) pass through unchanged. See lib/company-path.ts.
 */
const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link({ href, ...props }, ref) {
  const slug = useCompanySlug();
  const resolved =
    typeof href === "string"
      ? withCompanySlug(href, slug)
      : href.pathname
        ? { ...href, pathname: withCompanySlug(href.pathname, slug) }
        : href;
  return <NextLink ref={ref} href={resolved} {...props} />;
});

export default Link;
