import type { Metadata } from "next";
import { ExtensionsPanel } from "@/components/ExtensionsPanel";
import { PageTitle } from "@/components/PageTitle";
import { getExtensions } from "@/lib/prefs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Extensions" };

export default async function ExtensionsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Extensions">Add-ons you can switch on and off. Built in, nothing to install.</PageTitle>
      <ExtensionsPanel initial={await getExtensions()} />
    </div>
  );
}
