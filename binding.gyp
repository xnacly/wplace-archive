{
  "targets": [
    {
      "target_name": "pumpkin",
      "sources": ["src/native/pumpkin.c", "src/native/pumpkin_core.c"],
      "cflags_c": ["-std=c11", "-O3", "-lm"],
      "defines": ["NAPI_VERSION=8"]
    }
  ]
}
