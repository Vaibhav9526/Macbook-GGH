// window.jargon belongs in the application adapter.
export const documentation = "window.jargon";
export const viewport = () => window.innerWidth;
export const platformAction = (props: { jargon: () => void }) => props.jargon();
