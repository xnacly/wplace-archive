{
  "targets": [
    {
      "target_name": "pumpkin",
      "sources": ["src/native/pumpkin.c"],
      "cflags_c": ["-std=c11", "-O3"],
      "defines": ["NAPI_VERSION=8"]
    }
  ]
}
