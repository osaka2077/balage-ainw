/**
 * Fixture: DomNode mit eingebetteten PII-Daten
 * Kontaktformular mit ausgefuellten Feldern (FAKE PII).
 */

import type { DomNode } from "../../../shared_interfaces.js";

export const domWithPii: DomNode = {
  tagName: "form",
  attributes: { action: "/submit", method: "POST" },
  isVisible: true,
  isInteractive: true,
  children: [
    {
      tagName: "input",
      attributes: { type: "email", name: "email", value: "max.mustermann@example.com" },
      isVisible: true,
      isInteractive: true,
      children: [],
    },
    {
      tagName: "input",
      attributes: { type: "tel", name: "phone", value: "+49 171 1234567" },
      isVisible: true,
      isInteractive: true,
      children: [],
    },
    {
      tagName: "input",
      attributes: { type: "text", name: "iban", value: "DE89 3704 0044 0532 0130 00" },
      isVisible: true,
      isInteractive: true,
      children: [],
    },
    {
      tagName: "input",
      attributes: { type: "text", name: "cc", value: "4111 1111 1111 1111" },
      isVisible: true,
      isInteractive: true,
      children: [],
    },
    {
      tagName: "button",
      attributes: { type: "submit" },
      textContent: "Submit",
      isVisible: true,
      isInteractive: true,
      children: [],
    },
  ],
};
