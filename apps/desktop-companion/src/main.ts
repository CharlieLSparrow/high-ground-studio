import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron';
import path from 'path';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;

const createTray = () => {
  // Try to load the generated icon, fallback to a native blank image if not found yet during build
  let iconPath = path.join(__dirname, '../../../../artifacts/high_ground_desktop_icon_1780098229233.png');
  let icon = nativeImage.createFromPath(iconPath);
  
  if (icon.isEmpty()) {
    // Fallback if the path is wrong
    icon = nativeImage.createEmpty();
  }
  
  icon = icon.resize({ width: 22, height: 22 });
  
  tray = new Tray(icon);
  tray.setToolTip('High Ground Engine');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => showWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => {
        app.quit();
      } 
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  
  // Also open window when tray icon is clicked directly (Mac standard behavior)
  tray.on('click', () => {
    showWindow();
  });
};

const showWindow = () => {
  if (mainWindow) {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  }
};

const createWindow = () => {
  // Create the browser window and show it immediately so the user can see it
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    show: true, // Show initially so they don't miss it!
    frame: false, // Borderless modern look
    transparent: true,
    vibrancy: 'hud',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // mainWindow.on('blur', () => {
  //   mainWindow?.hide();
  // });
};

app.on('ready', () => {
  createTray();
  createWindow();
  
  ipcMain.on('hide-window', () => {
    mainWindow?.hide();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
