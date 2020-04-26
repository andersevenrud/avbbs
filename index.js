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
    AVBBS_ARCH: options.arch,
    AVBBS_PLATFORM: options.platform
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
  .option('--platform <platform>', 'Target platform', /[\w-]+/, 'pc')
  .option('--dest <destination>', 'Destination workspace', undefined, '/tmp/avbbs')
  .option('--clean', 'Always build freshly', caporal.BOOL)
  .option('--clean-all', 'Deletes all files workspace', caporal.BOOL)
  .action(main)

caporal.parse(process.argv)
