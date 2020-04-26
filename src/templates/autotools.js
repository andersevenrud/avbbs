/*!
 * A very basic build system
 * @author Anders Evenrud <andersevenrud@gmail.com>
 * @license MIT
 */

const deepmerge = require('deepmerge')

const flags = [
  '--prefix=/usr',
  '--sysconfdir=/etc',
  '--libdir=/usr/lib',
  '--libexecdir=/usr/lib',
  '--localstatedir=/var'
]

const additions = {
  autoconf: {
    flags: []
  }
}

const defaults = (config) => ({
  build: {
    commands: {
      configure: [
        'autoconf -f -i -v',
        `$AVBBS_BUILD_DIR/configure ${[...flags, ...config.autoconf.flags].join(' ')}`
      ],
      build: [
        'make'
      ],
      install: [
        'make install DESTDIR=$AVBBS_INSTALL_DIR'
      ],
      clean: [
        'make distclean'
      ]
    }
  }
})

module.exports = {
  configure: async (cwd, config) => {
    const updated = deepmerge(config, additions)

    return deepmerge(defaults(updated), updated, {
      arrayMerge: target => target
    })
  }
}
