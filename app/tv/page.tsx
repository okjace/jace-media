import { redirect } from "next/navigation";

/**
 * Jace Media for TVs lives in public/tv-app/index.html: one self-contained
 * page with plain CSS and simple JavaScript, so it works on older TV browser
 * engines (LG webOS 4+) that can't run the rest of the site's styles.
 */
export default function TvPage() {
  redirect("/tv-app/index.html");
}
