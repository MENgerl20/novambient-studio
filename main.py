import os
import sys
import json
import webview

class NovaAmbientAPI:
    def __init__(self):
        self._window = None
        self._is_maximized = False

    def set_window(self, window):
        self._window = window

    def minimize(self):
        if self._window:
            self._window.minimize()

    def toggle_maximize(self):
        if self._window:
            if self._is_maximized:
                self._window.restore()
                self._is_maximized = False
            else:
                self._window.maximize()
                self._is_maximized = True

    def toggle_fullscreen(self):
        if self._window:
            self._window.toggle_fullscreen()

    def destroy(self):
        if self._window:
            self._window.destroy()

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
                
            if isinstance(save_path, list):
                save_path = save_path[0]
                
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
                
            if isinstance(load_path, list):
                load_path = load_path[0]
                
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
        easy_drag=True
    )
    
    api.set_window(window)
    webview.start(debug=True)

if __name__ == '__main__':
    main()
