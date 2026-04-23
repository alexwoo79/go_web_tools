import os
import sys

# Ensure the plugins directory is in the Python path
plugins_path = os.path.join(os.path.dirname(__file__), '../plugins')
if plugins_path not in sys.path:
    sys.path.append(plugins_path)

import importlib

def render_chart(name, df, config):
    module = importlib.import_module(f"plugins.{name}")
    return module.render(df, config)