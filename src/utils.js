/*!
 * A very basic build system
 * @author Anders Evenrud <andersevenrud@gmail.com>
 * @license MIT
 */

const os = require('os')
const { spawn } = require('child_process')
const { Validator } = require('jsonschema')

/**
 * Discovers host arch
 */
const discoverArch = () => {
  const arch = os.arch()
  const map = {
    x64: 'x86_64',
    x32: 'i386'
  }

  return map[arch] || arch
}

/**
 * Validates a schema
 */
const validateSchema = (instance, schema) => (new Validator())
  .validate(instance, schema)

/**
 * Spawns a new process as a Promise w/Hook support
 */
const spawnProcess = (cmd, args, options, cb = () => {}) =>
  new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, options)
    proc.on('error', error => reject(new Error(error)))
    proc.on('close', code => {
      const str = `Process exited with code: ${code}`
      return code !== 0
        ? reject(new Error(str))
        : resolve(str)
    })

    cb(proc)
  })

module.exports = {
  discoverArch,
  validateSchema,
  spawnProcess
}
