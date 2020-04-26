/*!
 * A very basic build system
 * @author Anders Evenrud <andersevenrud@gmail.com>
 * @license MIT
 */

const path = require('path')
const { parseArgsStringToArgv } = require('string-argv')
const envstr = require('env-string')
const sequmise = require('sequmise')
const { spawnProcess } = require('./utils')
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
    proc.stdout.on('data', buffer => logger.info(buffer.toString()))
    proc.stderr.on('data', buffer => logger.error(buffer.toString()))
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
const mapStepCommands = (config, globals, steps) => steps
  .flatMap(step => config.build.commands[step]
    .map(mapCommandString)
    .map(({ command, env }) => {
      const vars = {
        ...globals,
        ...env
      }

      return {
        exec: parseArgsStringToArgv(envstr(command, vars)),
        env: vars,
        command,
        step
      }
    })
  )

/**
 * Runs package build steps(s)
 */
const runPackageBuild = async ({
  cwd,
  state,
  steps,
  globals,
  logger,
  config
}) => {
  const launch = commandLauncher({ logger })
  const commands = mapStepCommands(config, globals, steps)

  const promises = commands.map(({ step, command, exec, env }) => async () => {
    const logstr = message => `>>> [${step}] ${config.name}: ${message}`
    const started = new Date()
    const commandOptions = { cwd, env }

    logger.debug(logstr(`Working dir ${commandOptions.cwd}`))
    logger.debug(logstr(command))

    if (state.indexOf(step) !== -1) {
      logger.info(logstr('Skipping because step was previously finished'))
      return
    }

    try {
      const message = await launch(exec, commandOptions)
      logger.debug(logstr(message))

      await appendPackageState(cwd, step)
    } finally {
      const timeSpent = (new Date()) - started
      logger.info(logstr(`Finished after ${timeSpent}ms`))
    }
  })

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
  const { resolved, configs } = await resolvePackages(args)

  const promises = resolved.map(str => async () => {
    const cwd = path.resolve(args.root, str)
    const config = configs.find(cfg => cfg.name === str)
    const state = options.clear
      ? await clearPackageState(cwd)
      : await readPackageState(cwd)

    return runPackageBuild({
      steps: PACKAGE_BUILD_STEPS,
      globals,
      options,
      logger,
      config,
      state,
      cwd
    })
  })

  try {
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
