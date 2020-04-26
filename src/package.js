/*!
 * A very basic build system
 * @author Anders Evenrud <andersevenrud@gmail.com>
 * @license MIT
 */

const path = require('path')
const depresolve = require('node-resolve-dependency-graph/lib')
const fs = require('fs-extra')
const glob = require('fast-glob')
const deepmerge = require('deepmerge')
const { validateSchema } = require('./utils')

/**
 * Packge configuation filename
 */
const PACKAGE_CONFIG = 'build.json'

/**
 * Packge configuation filename
 */
const PACKAGE_STATE = '.build-state.json'

/**
 * Package configuration build steps
 */
const PACKAGE_BUILD_STEPS = [
  'pre-configure',
  'configure',
  'post-configure',
  'pre-build',
  'build',
  'post-build',
  'pre-install',
  'install',
  'post-install',
  'clean'
]

/**
 * Custom package schema validation error
 */
class PackageSchemaError extends Error {
  constructor(dir, errors) {
    super(`Package '${path.basename(dir)}' validation failed`)

    this.errors = errors
      .map(({ stack }) => stack)
      .map(str => str.replace(/^instance\s+/, ''))
  }
}

/**
 * Package configuration schema
 */
const schema = {
  type: 'object',
  required: [
    'name',
    'version',
    'build'
  ],
  properties: {
    name: { type: 'string' },
    version: { type: 'string' },
    template: { type: 'string' },
    licenses: {
      type: 'array',
      items: { type: 'string' }
    },
    build: {
      type: 'object',
      required: [
        'commands'
      ],
      properties: {
        depends: {
          type: 'array',
          items: { type: 'string' }
        },
        commands: {
          type: 'object',
          required: [
            'configure',
            'build'
          ],
          properties: Object.fromEntries(
            PACKAGE_BUILD_STEPS.map(step => [step, {
              type: 'array',
              items: {
                oneOf: [
                  {
                    type: 'string'
                  },
                  {
                    type: 'object',
                    properties: {
                      command: { type: 'string' },
                      env: { type: 'object' }
                    }
                  }
                ]
              }
            }])
          )
        }
      }
    }
  }
}

/**
 * Package configuration defaults
 */
const defaultObject = {
  build: {
    depends: [],
    commands: Object.fromEntries(
      PACKAGE_BUILD_STEPS.map(step => [step, []])
    )
  }
}

/**
 * Reads and validates a package by path
 */
const readPackage = async (dir) => {
  const configPath = path.resolve(dir, PACKAGE_CONFIG)
  const json = await fs.readJSON(configPath)
  const result = validateSchema(json, schema)

  if (result.errors.length > 0) {
    throw new PackageSchemaError(dir, result.errors)
  }

  return deepmerge(defaultObject, json)
}

/**
 * Reads the package state file
 */
const readPackageState = async (dir) => {
  const statePath = path.resolve(dir, PACKAGE_STATE)
  return await fs.exists(statePath)
    ? fs.readJSON(statePath)
    : []
}

/**
 * Appends to the package state file
 */
const appendPackageState = async (dir, append) => {
  const statePath = path.resolve(dir, PACKAGE_STATE)
  const state = await readPackageState(dir)
  const newState = [...state, append]

  await fs.writeJSON(statePath, newState)

  return newState
}

/**
 * Clears (removes package state file)
 */
const clearPackageState = async (dir, remove = true) => {
  const statePath = path.resolve(dir, PACKAGE_STATE)

  if (remove) {
    await fs.writeJSON(statePath, [])
  } else if (await fs.exists(statePath)) {
    await fs.remove(statePath)
  }

  return []
}

/**
 * Resolves the package dependency configuration tree
 */
const resolvePackages = async (args) => {
  const root = path.join(
    path.resolve(args.root),
    '**',
    PACKAGE_CONFIG
  )

  const packages = (await glob(root)).map(dir => path.dirname(dir))
  const configs = await Promise.all(packages.map(readPackage))

  const deptree = Object.fromEntries(configs.map(config => [
    config.name,
    config.build.depends
  ]))

  const resolved = depresolve.flat(
    depresolve.resolve(deptree)
  )

  return { resolved, configs }
}

module.exports = {
  PACKAGE_CONFIG,
  PACKAGE_STATE,
  PACKAGE_BUILD_STEPS,
  PackageSchemaError,
  schema,
  defaultObject,
  readPackage,
  resolvePackages,
  readPackageState,
  appendPackageState,
  clearPackageState
}
