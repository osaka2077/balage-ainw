/**
 * HTML → DomNode Konverter (ohne Playwright)
 *
 * Parst raw HTML in BALAGE's DomNode-Format.
 * Ermoeglicht analyzeFromHTML() ohne Browser-Dependency.
 */

import pino from "pino";
import type { DomNode } from "./types.js";

const logger = pino({ name: "balage:html-to-dom", level: process.env["LOG_LEVEL"] ?? "silent" });

const INTERACTIVE_TAGS = new Set([
  "input", "select", "textarea", "button", "a",
  "details", "summary", "dialog",
]);

const INTERACTIVE_ROLES = new Set([
  "button", "link", "textbox", "checkbox", "radio",
  "combobox", "listbox", "menuitem", "tab", "switch",
  "searchbox", "slider", "spinbutton", "option",
]);

interface ParseState {
  pos: number;
  html: string;
  path: string;
}

/**
 * Simple HTML → DomNode parser. Handles real-world HTML including
 * self-closing tags, malformed markup, and edge cases.
 *
 * Fuer kaputtes HTML wird ein best-effort Ergebnis zurueckgegeben,
 * niemals ein throw. Das Ergebnis ist immer ein valider DomNode-Baum.
 */
export function htmlToDomNode(html: string): DomNode {
  // Guard: nicht-string Input abfangen (JS-Consumer ohne TypeScript)
  if (typeof html !== "string") {
    return createEmptyBody();
  }

  const trimmed = html.trim();
  if (trimmed.length === 0) {
    return createEmptyBody();
  }

  // Limitierung: Extrem grosses HTML (>10MB) abschneiden, um OOM zu vermeiden
  const MAX_HTML_LENGTH = 10 * 1024 * 1024;
  const safeHtml = trimmed.length > MAX_HTML_LENGTH
    ? trimmed.slice(0, MAX_HTML_LENGTH)
    : trimmed;

  try {
    const state: ParseState = { pos: 0, html: safeHtml, path: "" };
    const children = parseChildren(state, null);

    return {
      tagName: "body",
      attributes: {},
      isVisible: true,
      isInteractive: false,
      children,
    };
  } catch (err) {
    logger.warn({ err, htmlLength: safeHtml.length }, "HTML parser failed — returning empty body (0 endpoints will be detected)");
    return createEmptyBody();
  }
}

function createEmptyBody(): DomNode {
  return {
    tagName: "body",
    attributes: {},
    isVisible: true,
    isInteractive: false,
    children: [],
  };
}

function parseChildren(state: ParseState, _parentTag: string | null): DomNode[] {
  const nodes: DomNode[] = [];
  let textBuffer = "";

  while (state.pos < state.html.length) {
    if (state.html[state.pos] === "<") {
      // Flush text buffer
      if (textBuffer.trim()) {
        nodes.push({
          tagName: "#text",
          attributes: {},
          textContent: textBuffer.trim().slice(0, 4096),
          isVisible: true,
          isInteractive: false,
          children: [],
        });
      }
      textBuffer = "";

      // Closing tag?
      if (state.html[state.pos + 1] === "/") {
        // End of parent — return
        const closeEnd = state.html.indexOf(">", state.pos);
        if (closeEnd >= 0) state.pos = closeEnd + 1;
        return nodes;
      }

      // Comment?
      if (state.html.slice(state.pos, state.pos + 4) === "<!--") {
        const commentEnd = state.html.indexOf("-->", state.pos + 4);
        state.pos = commentEnd >= 0 ? commentEnd + 3 : state.html.length;
        continue;
      }

      // DOCTYPE / processing instruction?
      if (state.html[state.pos + 1] === "!" || state.html[state.pos + 1] === "?") {
        const piEnd = state.html.indexOf(">", state.pos);
        state.pos = piEnd >= 0 ? piEnd + 1 : state.html.length;
        continue;
      }

      // Parse opening tag
      const node = parseTag(state);
      if (node) nodes.push(node);
    } else {
      textBuffer += state.html[state.pos]!;
      state.pos++;
    }
  }

  if (textBuffer.trim()) {
    nodes.push({
      tagName: "#text",
      attributes: {},
      textContent: textBuffer.trim().slice(0, 4096),
      isVisible: true,
      isInteractive: false,
      children: [],
    });
  }

  return nodes;
}

const SELF_CLOSING = new Set([
  "area", "base", "br", "col", "embed", "hr", "img",
  "input", "link", "meta", "param", "source", "track", "wbr",
]);

const SKIP_CONTENT_TAGS = new Set(["script", "style", "noscript", "svg"]);

function parseTag(state: ParseState): DomNode | null {
  const tagStart = state.pos;
  const tagEnd = state.html.indexOf(">", tagStart);
  if (tagEnd < 0) {
    state.pos = state.html.length;
    return null;
  }

  const tagContent = state.html.slice(tagStart + 1, tagEnd);
  const selfClose = tagContent.endsWith("/");
  const cleanContent = selfClose ? tagContent.slice(0, -1).trim() : tagContent.trim();

  // Extract tag name
  const spaceIdx = cleanContent.search(/[\s/]/);
  const tagName = (spaceIdx > 0 ? cleanContent.slice(0, spaceIdx) : cleanContent).toLowerCase();

  if (!tagName || tagName.startsWith("/")) {
    state.pos = tagEnd + 1;
    return null;
  }

  // Extract attributes
  const attrString = spaceIdx > 0 ? cleanContent.slice(spaceIdx) : "";
  const attributes = parseAttributes(attrString);

  state.pos = tagEnd + 1;

  // Skip script/style content
  if (SKIP_CONTENT_TAGS.has(tagName)) {
    const closeTag = `</${tagName}>`;
    const closeIdx = state.html.toLowerCase().indexOf(closeTag, state.pos);
    state.pos = closeIdx >= 0 ? closeIdx + closeTag.length : state.html.length;
    return null;
  }

  // Self-closing tags
  const isSelfClosing = selfClose || SELF_CLOSING.has(tagName);
  const children = isSelfClosing ? [] : parseChildren(state, tagName);

  // Determine interactivity
  const role = attributes["role"] ?? "";
  const isInteractive = INTERACTIVE_TAGS.has(tagName)
    || INTERACTIVE_ROLES.has(role)
    || attributes["tabindex"] !== undefined
    || attributes["contenteditable"] === "true"
    || attributes["onclick"] !== undefined;

  // Determine visibility (heuristic)
  const isHidden = attributes["hidden"] !== undefined
    || (attributes["style"] ?? "").includes("display:none")
    || (attributes["style"] ?? "").includes("display: none")
    || attributes["type"] === "hidden";

  // Collect text content from direct text children
  const textContent = children
    .filter(c => c.tagName === "#text")
    .map(c => c.textContent ?? "")
    .join(" ")
    .trim()
    .slice(0, 4096) || undefined;

  return {
    tagName,
    attributes,
    textContent,
    isVisible: !isHidden,
    isInteractive,
    children: children.filter(c => c.tagName !== "#text" || !c.textContent),
  };
}

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(attrString)) !== null) {
    const name = match[1]!.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[name] = value;
  }

  return attrs;
}
