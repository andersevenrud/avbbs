/*!
 * A very basic build system
 * @author Anders Evenrud <andersevenrud@gmail.com>
 * @license MIT
 */

const path = require('path')
const fs = require('fs-extra')
const envstr = require('env-string')
const sequmise = require('sequmise')
const decompress = require('decompress')
const { parseArgsStringToArgv } = require('string-argv')
const {
  spawnProcess,
  fetchArchive
} = require('./utils')
const {
  PACKAGE_BUILD_STEPS,
  PackageSchemaError,
  resolvePackages,
  readPackageState,
  appendPackageState,
  clearPackageState
} = require('./package')

/**
 * Command launcher that pipes to a logger
 */
const commandLauncher = ({ logger }) => (exec, options) => {
  const [cmd, ...args] = exec
  const hook = (proc) => {
    /*
    proc.stdout.on('data', buffer => logger.info(buffer.toString()))
    proc.stderr.on('data', buffer => logger.error(buffer.toString()))
    */
    proc.stdout.on('data', buffer => process.stdout.write(buffer.toString()))
    proc.stderr.on('data', buffer => process.stdout.write(buffer.toString()))
  }

  return spawnProcess(cmd, args, options, hook)
}

/**
 * Makes sure all step commands is an object
 */
const mapCommandString = input => ({
  command: '',
  env: {},
  ...typeof input === 'string'
    ? { command: input }
    : input || {}
})

/**
 * Maps and flattens package step commands
 */
const mapStepCommands = ({
  config,
  steps,
  vars
}) => steps
  .flatMap(step => config.build.commands[step]
    .map(mapCommandString)
    .map(({ command, env }) => ({
      exec: parseArgsStringToArgv(envstr(command, vars)),
      env: { ...vars, ...env },
      command,
      step
    }))
  )

/**
 * Downloads and extracts the package source if needed
 */
const downloadAndExtract = async ({
  logger,
  config,
  ctxdir,
  builddir
}) => {
  const source = envstr(config.source, config)
  const filename = path.basename(source)
  const archive = path.resolve(ctxdir, filename)

  logger.info(`<<< Downloading ${source}`)

  const exists = await fs.exists(archive)
  const buffer = exists
    ? await fs.readFile(archive)
    : await fetchArchive(source)

  if (!exists) {
    fs.writeFile(archive, buffer)
  }

  logger.info(`<<< Extracting ${filename}`)

  const ls = await fs.readdir(builddir)
  if (ls.length === 0) {
    await decompress(buffer, builddir)
  }
}


/**
 * Runs package build steps(s)
 */
const runPackageBuild = async ({
  cwd,
  state,
  steps,
  vars,
  logger,
  config,
  ctxdir,
  builddir,
  installdir,
  realbuilddir
}) => {
  const launch = commandLauncher({ logger })
  const commands = mapStepCommands({
    config,
    steps,
    vars
  })

  const promises = commands.map(({ step, command, exec, env }) => async () => {
    const logstr = message => `>>> [${step}] ${config.name}: ${message}`
    const started = new Date()

    logger.debug(logstr(command))

    if (state.indexOf(command) !== -1) {
      logger.info(logstr('Skipping because step was previously finished'))
      return
    }

    try {
      const message = await launch(exec, {
        cwd: realbuilddir,
        env
      })

      logger.debug(logstr(message))

      await appendPackageState(ctxdir, command)
    } finally {
      const timeSpent = (new Date()) - started
      logger.info(logstr(`Finished after ${timeSpent}ms`))
    }
  })

  logger.info(`--- Package ${cwd}`)
  logger.debug(`>>> Directories ${ctxdir}`)
  logger.debug(`>>> Build directory ${realbuilddir}`)
  logger.debug(`>>> Install directory ${installdir}`)

  if (config.source) {
    await downloadAndExtract({
      logger,
      config,
      ctxdir,
      builddir
    })
  }

  return sequmise(promises)
}

/**
 * Runs builds on all packages
 */
const runBuild = async ({
  args,
  options,
  logger,
  globals
}) => {
  const installdir = path.resolve(options.dest, 'install')
  const { resolved, configs } = await resolvePackages(args.root)

  const promises = resolved.map(str => async () => {
    const cwd = path.resolve(args.root, str)
    const config = configs.find(cfg => cfg.name === str)
    const ctxdir = path.resolve(options.dest, config.name)
    const builddir = path.resolve(ctxdir, 'build')
    const realbuilddir = path.resolve(
      builddir,
      envstr(config.build.context || '', config)
    )

    await fs.ensureDir(builddir)

    if (options.clean) {
      await clearPackageState(ctxdir)
      await fs.emptyDir(builddir)
    }

    const state = await readPackageState(ctxdir)

    const vars = {
      AVBBS_CONTEXT_DIR: ctxdir,
      AVBBS_BUILD_DIR: realbuilddir,
      AVBBS_INSTALL_DIR: installdir,
      AVBBS_SOURCE: config.build.source
        ? config.build.source(envstr(config.build.src, sourceVars))
        : '',
      ...process.env,
      ...globals
    }

    return runPackageBuild({
      steps: PACKAGE_BUILD_STEPS,
      vars,
      ctxdir,
      builddir,
      installdir,
      realbuilddir,
      globals,
      logger,
      config,
      state,
      cwd
    })
  })

  try {
    if (options.cleanAll) {
      await fs.emptyDir(path.resolve(options.dest))
    }

    await fs.ensureDir(installdir)
    await sequmise(promises)
  } catch (e) {
    if (e instanceof PackageSchemaError) {
      logger.error(e.message, e.errors)
    } else {
      console.error(e)
    }
  }
}

module.exports = {
  runBuild,
  runPackageBuild,
  mapCommandString,
  mapStepCommands,
  commandLauncher
}
