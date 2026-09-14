'use strict'

/**
 * Graphify — open the local viewer.
 *
 * Opens documentation/graphify/viewer.html in the platform default browser.
 * Requires the viewer to exist (run `npm run graphify` first — the
 * `graphify:view` script does both).
 */

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const viewer = path.resolve(__dirname, '..', '..', 'documentation', 'graphify', 'viewer.html')

function open() {
  if (!fs.existsSync(viewer)) {
    console.error(`Graphify viewer not found: ${viewer}`)
    console.error(
      'Run `npm run graphify` first (or use `npm run graphify:view` which regenerates as well).'
    )
    process.exit(1)
  }

  const platform = process.platform
  let cmd
  let args

  if (platform === 'win32') {
    // `start "" "path"` via cmd — quotes handle spaces in the path.
    cmd = 'cmd.exe'
    args = ['/d', '/s', '/c', `start "" "${viewer}"`]
  } else if (platform === 'darwin') {
    cmd = 'open'
    args = [viewer]
  } else {
    cmd = 'xdg-open'
    args = [viewer]
  }

  const child = spawn(cmd, args, { stdio: 'ignore', detached: true })
  child.on('error', (err) => {
    console.error(`Could not open the viewer (${viewer}): ${err.message}`)
    console.error('Open the file manually in your browser.')
  })
  child.unref()
  console.log(`Opened Graphify viewer: ${viewer}`)
}

open()
