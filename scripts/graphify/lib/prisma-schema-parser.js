'use strict'

/**
 * Graphify — Prisma schema parser.
 *
 * Reads a `schema.prisma` file and returns a structured representation of
 * models, fields, relations, enums, indexes and table mappings. This is the
 * source of truth for every Graphify database/ER diagram.
 *
 * Note: this is a focused, dependency-free parser written for the exact
 * Prisma schema dialect used by PharmaCare (Prisma 5, PostgreSQL provider).
 */

const fs = require('fs')

function stripComments(text) {
  // Block comments (Prisma supports /* ... */)
  let out = text.replace(/\/\*[\s\S]*?\*\//g, '')
  // Line comments (// ...) — but be careful not to mangle urls inside
  // @db / @relation attribute strings. None occur in this schema, so a
  // simple pass is safe here.
  out = out
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('//')
      return idx === -1 ? line : line.slice(0, idx)
    })
    .join('\n')
  return out
}

function extractBlocks(text) {
  const blocks = []
  const re = /^(model|enum)\s+([A-Za-z0-9_]+)\s*\{/gm
  let m
  while ((m = re.exec(text)) !== null) {
    const kind = m[1]
    const name = m[2]
    const bodyStart = re.lastIndex
    let depth = 1
    let i = bodyStart
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') depth--
      i++
    }
    blocks.push({ kind, name, body: text.slice(bodyStart, i - 1) })
  }
  return blocks
}

function extractRelationMeta(attrs) {
  if (!attrs) return { fields: [], references: [], name: null }
  const match = attrs.match(/@relation\(([\s\S]*)\)/)
  if (!match) return { fields: [], references: [], name: null }
  const inner = match[1]
  const nameMatch = inner.match(/^"([^"]*)"\s*,?/)
  const name = nameMatch ? nameMatch[1] : null
  const fieldsMatch = inner.match(/\bfields:\s*\[([^\]]*)\]/)
  const refsMatch = inner.match(/\breferences:\s*\[([^\]]*)\]/)
  const fields = fieldsMatch
    ? fieldsMatch[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  const references = refsMatch
    ? refsMatch[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  return { name, fields, references }
}

function parseField(line) {
  // name typeWithCardinality? attributes?
  const m = line.match(/^([A-Za-z0-9_]+)\s+([A-Za-z0-9_.]+)(\[\]|\?)?(\s+@.*)?$/)
  if (!m) {
    return { name: null, type: null, raw: line }
  }
  const name = m[1]
  const type = m[2]
  const optional = m[3] === '?'
  const isList = m[3] === '[]'
  const attrs = (m[4] || '').trim()

  const relation = extractRelationMeta(attrs)

  return {
    name,
    type,
    optional,
    isList,
    attrs,
    isId: /\b@id\b/.test(attrs),
    isUnique: /\b@unique\b/.test(attrs) || /\b@id\b/.test(attrs),
    isRelation: relation.name !== null || relation.fields.length > 0,
    relation,
  }
}

function parseModelBody(body) {
  const fields = []
  const modelAttrs = []
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('@@')) {
      modelAttrs.push(line)
      continue
    }
    const field = parseField(line)
    if (field.name) fields.push(field)
  }

  const mapMatch = modelAttrs.join('\n').match(/@@map\("([^"]+)"\)/)
  const indexes = modelAttrs
    .filter((a) => a.startsWith('@@index'))
    .map((a) => a.replace('@@index', '').trim())
  const uniques = modelAttrs
    .filter((a) => a.startsWith('@@unique'))
    .map((a) => a.replace('@@unique', '').trim())

  return {
    fields,
    map: mapMatch ? mapMatch[1] : null,
    indexes,
    uniques,
  }
}

function parseSchema(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const clean = stripComments(text)
  const blocks = extractBlocks(clean)

  const models = []
  const enums = []
  const modelByName = {}

  for (const block of blocks) {
    if (block.kind === 'enum') {
      const values = block.body
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('//'))
      enums.push({ name: block.name, values })
      continue
    }

    const parsed = parseModelBody(block.body)
    const model = {
      name: block.name,
      table: parsed.map || block.name,
      fields: parsed.fields,
      indexes: parsed.indexes,
      uniques: parsed.uniques,
    }
    models.push(model)
    modelByName[model.name] = model
  }

  // Build explicit-FK relations (every relation in this schema carries an
  // explicit `@relation(fields: [...], references: [...])` on one side).
  const relations = []
  for (const model of models) {
    for (const field of model.fields) {
      if (!field.relation || field.relation.fields.length === 0) continue
      if (!modelByName[field.type]) continue // not a relation to a model
      if (field.isList) continue // list fields never carry fk attributes
      relations.push({
        child: model.name,
        childField: field.name,
        childFieldOptional: field.optional,
        parent: field.type,
        parentField: field.relation.fields[0],
        refField: field.relation.references[0] || 'id',
        label: field.relation.name,
        isOneToOne: field.isUnique,
      })
    }
  }

  const scalarTypes = new Set([
    'String',
    'Int',
    'BigInt',
    'Boolean',
    'DateTime',
    'Float',
    'Decimal',
    'Json',
    'Bytes',
  ])

  function modelFieldCount(model) {
    return model.fields.filter((f) => scalarTypes.has(f.type) || modelByName[f.type]).length
  }

  const stats = {
    modelCount: models.length,
    enumCount: enums.length,
    relationCount: relations.length,
    fieldCount: models.reduce((acc, m) => acc + modelFieldCount(m), 0),
    scalarTypes: [...scalarTypes],
  }

  return {
    filePath,
    models,
    enums,
    relations,
    modelByName,
    stats,
    scalarTypes,
  }
}

module.exports = { parseSchema, stripComments, extractBlocks }
