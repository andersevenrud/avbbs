/*!
 * A very basic build system
 * @author Anders Evenrud <andersevenrud@gmail.com>
 * @license MIT
 */

const caporal = require('caporal')
const { discoverArch } = require('./src/utils')
const { runBuild } = require('./src/builder')

/**
 * Performs build of all packages in correct order
 */
const main = (args, options, logger) => {
  const globals = {
    BUILD_ARCH: options.arch,
  }

  return runBuild({
    args,
    options,
    logger,
    globals
  })
}

caporal
  .version('0.0.1')
  .argument('<root>', 'Packages root path')
  .option('--arch <arch>', 'Target architecture', /[\w_]+/, discoverArch())
  .option('--dest <destination>', 'Destination installation path', undefined, '/tmp/build')
  .option('--clear', 'Clears package states before build', caporal.BOOL)
  .action(main)

caporal.parse(process.argv)
