import importlib

def render_chart(name, df, cfg):
    module = importlib.import_module(f"plugins.{name}")
    # 兼容color为None的情况
    if cfg.get("color") is None:
        cfg = dict(cfg)
        cfg.pop("color", None)
    return module.render(df, cfg)