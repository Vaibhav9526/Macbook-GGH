import { createFileRoute } from "@tanstack/solid-router";
import { LandingPage } from "../components/landing/LandingPage";
import { jargonHomeHead } from "../lib/site-metadata";
import { JARGON_SOFTWARE_APPLICATION } from "../lib/software-application";

export const Route = createFileRoute("/")({
  head: () => jargonHomeHead(JARGON_SOFTWARE_APPLICATION),
  component: LandingPage,
});
