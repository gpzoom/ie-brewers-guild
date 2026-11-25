import { createContext } from "react";

/** True while the 21+ check covers the page. A modal opened then would lock the check itself. */
export const AgeGateShown = createContext(false);
