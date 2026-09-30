{
  "targets": [
    {
      "target_name": "steam_friends",
      "sources": ["src/steam-friends.cc"],
      "defines": ["NAPI_VERSION=8"],
      "conditions": [
        ["OS=='win'", {
          "defines": ["WIN32_LEAN_AND_MEAN", "NOMINMAX"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/std:c++17"]
            }
          }
        }]
      ]
    }
  ]
}
