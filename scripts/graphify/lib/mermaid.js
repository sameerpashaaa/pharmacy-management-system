'use strict'

/**
 * Graphify — Mermaid helpers.
 *
 * Small utilities for building mermaid sources: safe node ids, label
 * quoting, subgraph helpers and the fenced-markdown writer used by every
 * diagram document.
 */

function nodeId(label) {
  let id = label.replace(/[^A-Za-z0-9_]/g, '_')
  if (/^[0-9]/.test(id)) id = 'n_' + id
  return id
}

function q(label) {
  // Mermaid label used inside quoted node text: escape quotes/backslashes.
  const s = String(label).replace(/\\/g, '\\\\').replace(/"/g, '&quot;').replace(/\n/g, ' ')
  return `"${s}"`
}

function node(id, label, opts = {}) {
  const shape = opts.shape || 'rect' // rect | round | circle | stadium | diamond
  const text = q(label)
  const inner = opts.class ? `${text}${opts.class ? ':::' + opts.class : ''}` : text
  switch (shape) {
    case 'round':
      return `${id}(${text})${opts.class ? ':::' + opts.class : ''}`
    case 'circle':
      return `${id}((${text}))`
    case 'stadium':
      return `${id}([${text}])`
    case 'diamond':
      return `${id}{${text}}`
    default:
      return `${id}[${inner}]`
  }
}

function edge(from, to, label, style) {
  const arrow = label ? ` -->|${q(label).replace(/"/g, '')}| ${to}` : ` --> ${to}`
  return `${from}${arrow}`
}

function subgraph(id, title, lines) {
  const body = Array.isArray(lines) ? lines.join('\n') : lines
  return `subgraph ${id}[${title}]\n${indent(body)}\nend`
}

function indent(text) {
  return text
    .split('\n')
    .map((l) => (l ? '  ' + l : l))
    .join('\n')
}

function classDefs(defs) {
  // defs: { className: 'fill:...,stroke:...' }
  return Object.entries(defs)
    .map(([name, style]) => `classDef ${name} ${style}`)
    .join('\n')
}

function block(label) {
  return '```mermaid\n' + label + '\n```'
}

module.exports = { nodeId, q, node, edge, subgraph, indent, classDefs, block }
