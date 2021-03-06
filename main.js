"use strict";
//the following code is invluable optimization for using require()
//if you dont cache the fs, node re-checks it for EVERY FILE IN EVERY MODULE
var lru = require('lru-cache')({max: 256, maxAge: 250/*ms*/});
var fs = require('fs');
var origLstat = fs.lstatSync.bind(fs);
// NB: The biggest offender of thrashing lstatSync is the node module system
// itself, which we can't get into via any sane means.
require('fs').lstatSync = function(p) {
  let r = lru.get(p);
  if (r) return r;

  r = origLstat(p);
  lru.set(p, r);
  return r;
};

//normal electron code starts here
const electron = require('electron');
const {app, Menu, dialog} = electron;

var log = require('electron-log');
log.transports.file.level=true;

// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow;

const path = require('path');
const url = require('url');

//ipc wiring for logging
const ipcMain = require('electron').ipcMain;
ipcMain.on('log', function(event, arg){
  log.info(arg);
});


// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

function createMenu() {
  const template = [
    {
      role: 'window',
      submenu: [
        {role: 'minimize'},
        {role: 'close'}
      ]
    },
    {
        label: 'View',
        submenu: [
          {
            role: 'reload'
          },
          {
            role: 'forcereload'
          },
          {
            role: 'toggledevtools'
          }

        ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}


function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({width: 1024, height: 768});
  mainWindow.maximize();
  createMenu();

  // and load the index.html of the app.
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
app.setAppUserModelId('ad-group-wrangler');