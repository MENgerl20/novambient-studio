import os
import sys
import json
import webview
import ctypes
from ctypes import wintypes
import threading

def set_click_through(hwnd, enabled=True):
    try:
        GWL_EXSTYLE = -20
        WS_EX_TRANSPARENT = 0x00000020
        WS_EX_LAYERED = 0x00080000
        
        SWP_NOSIZE = 0x0001
        SWP_NOMOVE = 0x0002
        SWP_NOZORDER = 0x0004
        SWP_NOACTIVATE = 0x0010
        SWP_FRAMECHANGED = 0x0020
        
        GetWindowLong = ctypes.windll.user32.GetWindowLongW
        SetWindowLong = ctypes.windll.user32.SetWindowLongW
        SetWindowPos = ctypes.windll.user32.SetWindowPos
        
        style = GetWindowLong(hwnd, GWL_EXSTYLE)
        if enabled:
            style |= (WS_EX_TRANSPARENT | WS_EX_LAYERED)
        else:
            style &= ~WS_EX_TRANSPARENT  # Do NOT disable WS_EX_LAYERED to preserve transparency
            
        SetWindowLong(hwnd, GWL_EXSTYLE, style)
        
        # Force the OS to update the window frame and styles immediately
        SetWindowPos(hwnd, None, 0, 0, 0, 0, 
                     SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED)
        return True
    except Exception as e:
        print(f"Error setting click through: {e}")
        return False

class HotkeyListener(threading.Thread):
    def __init__(self, api):
        super().__init__()
        self.api = api
        self.daemon = True
        self.running = True
        
    def run(self):
        MOD_ALT = 0x0001
        MOD_SHIFT = 0x0004
        VK_O = 0x4F # O key
        HOTKEY_ID = 99
        
        res = ctypes.windll.user32.RegisterHotKey(None, HOTKEY_ID, MOD_ALT | MOD_SHIFT, VK_O)
        if not res:
            print("Failed to register Alt+Shift+O")
            return
            
        msg = wintypes.MSG()
        while self.running:
            if ctypes.windll.user32.GetMessageW(ctypes.byref(msg), None, 0, 0) != 0:
                if msg.message == 0x0312: # WM_HOTKEY
                    if msg.wParam == HOTKEY_ID:
                        self.api.trigger_overlay_from_hotkey()
                ctypes.windll.user32.TranslateMessage(ctypes.byref(msg))
                ctypes.windll.user32.DispatchMessageW(ctypes.byref(msg))
                
        ctypes.windll.user32.UnregisterHotKey(None, HOTKEY_ID)

class NovaAmbientAPI:
    def __init__(self):
        self._window = None
        self._is_maximized = False
        self._is_overlay = False
        self._hotkey_listener = None

    def set_window(self, window):
        self._window = window
        self._window.events.maximized += self._on_maximized
        self._window.events.restored += self._on_restored
        
        # Start hotkey listener
        self._hotkey_listener = HotkeyListener(self)
        self._hotkey_listener.start()

    def _on_maximized(self):
        self._is_maximized = True

    def _on_restored(self):
        self._is_maximized = False

    def minimize(self):
        if self._window:
            self._window.minimize()

    def toggle_maximize(self):
        if self._window:
            if self._is_maximized:
                self._window.restore()
            else:
                self._window.maximize()

    def toggle_fullscreen(self):
        if self._window:
            self._window.toggle_fullscreen()

    def destroy(self):
        if self._window:
            self._window.destroy()

    def toggle_overlay(self):
        try:
            if not self._window:
                return {"error": "Window not initialized"}
                
            self._is_overlay = not self._is_overlay
            
            hwnd = ctypes.windll.user32.FindWindowW(None, 'NovaAmbient Studio — Ambient Sound & Focus Station')
            
            if self._is_overlay:
                # Save previous state
                self._prev_width = self._window.width
                self._prev_height = self._window.height
                self._prev_x = self._window.x
                self._prev_y = self._window.y
                self._prev_was_maximized = self._is_maximized
                
                # Enter overlay mode
                self._window.on_top = True
                
                # Resize manually instead of maximizing (prevents Windows transparency key red-screen bug)
                width = ctypes.windll.user32.GetSystemMetrics(0)
                height = ctypes.windll.user32.GetSystemMetrics(1)
                self._window.resize(width, height)
                self._window.move(0, 0)
                
                set_click_through(hwnd, True)
                self._window.evaluate_js("setOverlayMode(true)")
            else:
                # Exit overlay mode
                set_click_through(hwnd, False)
                self._window.on_top = False
                
                # Restore previous size and position
                self._window.resize(self._prev_width, self._prev_height)
                self._window.move(self._prev_x, self._prev_y)
                
                # If it was maximized before, restore the maximized state
                if self._prev_was_maximized:
                    self._window.maximize()
                    
                self._window.evaluate_js("setOverlayMode(false)")
                
            return {"status": "success", "is_overlay": self._is_overlay}
        except Exception as e:
            return {"error": str(e)}

    def trigger_overlay_from_hotkey(self):
        self.toggle_overlay()

    def save_preset(self, preset_json):
        try:
            if not self._window:
                return {"error": "Window not initialized"}
            
            file_types = ('NovaAmbient Preset (*.novambient)', 'All files (*.*)')
            save_path = self._window.create_file_dialog(
                webview.SAVE_DIALOG, 
                file_types=file_types, 
                save_filename='my_atmosphere.novambient'
            )
            
            if not save_path:
                return {"status": "cancelled"}
                
            if isinstance(save_path, (list, tuple)):
                if len(save_path) > 0:
                    save_path = save_path[0]
                else:
                    return {"status": "cancelled"}
                
            with open(save_path, 'w', encoding='utf-8') as f:
                f.write(preset_json)
                
            return {"status": "success", "filepath": save_path, "filename": os.path.basename(save_path)}
        except Exception as e:
            return {"error": str(e)}

    def load_preset(self):
        try:
            if not self._window:
                return {"error": "Window not initialized"}
                
            file_types = ('NovaAmbient Preset (*.novambient)', 'All files (*.*)')
            load_path = self._window.create_file_dialog(
                webview.OPEN_DIALOG, 
                file_types=file_types
            )
            
            if not load_path:
                return {"status": "cancelled"}
                
            if isinstance(load_path, (list, tuple)):
                if len(load_path) > 0:
                    load_path = load_path[0]
                else:
                    return {"status": "cancelled"}
                
            with open(load_path, 'r', encoding='utf-8') as f:
                data = f.read()
                
            # Verify valid JSON
            json.loads(data)
            
            return {
                "status": "success", 
                "content": data, 
                "filepath": load_path, 
                "filename": os.path.basename(load_path)
            }
        except Exception as e:
            return {"error": str(e)}

def main():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    html_path = os.path.join(current_dir, 'frontend', 'index.html')
    
    if not os.path.exists(html_path):
        html_path = 'frontend/index.html'

    api = NovaAmbientAPI()
    
    window = webview.create_window(
        title='NovaAmbient Studio — Ambient Sound & Focus Station',
        url=html_path,
        js_api=api,
        width=1100,
        height=720,
        min_size=(900, 600),
        background_color='#0b0b0e',
        frameless=True,
        easy_drag=True,
        transparent=True
    )
    
    api.set_window(window)
    webview.start(debug=True)

if __name__ == '__main__':
    main()
