/**
 * Fixture: DomNode mit Credentials in Formular-Feldern
 * Login-Formular mit ausgefuellten Credentials.
 */

import type { DomNode } from "../../../shared_interfaces.js";

export const domWithCredentials: DomNode = {
  tagName: "form",
  attributes: { action: "/login", method: "POST" },
  isVisible: true,
  isInteractive: true,
  children: [
    {
      tagName: "input",
      attributes: { type: "email", name: "username", value: "admin@company.com" },
      isVisible: true,
      isInteractive: true,
      children: [],
    },
    {
      tagName: "input",
      attributes: { type: "password", name: "password", value: "SuperSecret123!" },
      isVisible: true,
      isInteractive: true,
      children: [],
    },
    {
      tagName: "input",
      attributes: { type: "hidden", name: "api_token", value: "sk-proj-abc123def456ghi789jkl0" },
      isVisible: false,
      isInteractive: false,
      children: [],
    },
    {
      tagName: "button",
      attributes: { type: "submit" },
      textContent: "Login",
      isVisible: true,
      isInteractive: true,
      children: [],
    },
  ],
};
