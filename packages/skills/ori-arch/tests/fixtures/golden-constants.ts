/**
 * GOLDEN (golden test): ori-architect (旧 architect-expert agent) 生成結果の期待依存グラフ IR。
 * 元は stacks/<stack>/architecture.md.tpl を SUBSTITUTIONS
 * (APP_NAME=myapp / BC_NAME=task-management / BC_NAME_RS=task_management) で
 * render した出力から抽出 (ori-c79.4)。ori-c79.6 で tpl を削除した後は
 * こちらが唯一の期待値 SSoT (phase_hooks: DoD rule 4 の binding 再生成設定も保持)。
 */
export const GOLDEN = {
  "typescript": {
    "version": 1,
    "default_root": "default",
    "roots": [
      {
        "app": "myapp",
        "path": "apps/myapp/src",
        "language": "typescript",
        "layer_set": "ddd-vsa-hex-ts",
        "adapter": "eslint",
        "slice_root": "task-management",
        "slice_subdir": "slices",
        "public_entry": "index.ts",
        "id": "default"
      }
    ],
    "layer_sets": {
      "ddd-vsa-hex-ts": {
        "layers": [
          {
            "id": "shared",
            "kind": "shared"
          },
          {
            "id": "domain",
            "kind": "slice",
            "slice_internal": "slice-internal-ts"
          },
          {
            "id": "ui-widget",
            "kind": "ui-layer",
            "order": 1
          },
          {
            "id": "ui-page",
            "kind": "ui-layer",
            "order": 2
          }
        ],
        "rules": {
          "cross_layer": [
            {
              "from": "ui-page",
              "allow": [
                "ui-widget",
                "shared",
                "domain"
              ]
            },
            {
              "from": "ui-widget",
              "allow": [
                "shared",
                "domain"
              ]
            },
            {
              "from": "domain",
              "allow": [
                "shared"
              ]
            },
            {
              "from": "shared",
              "allow": []
            }
          ],
          "same_layer": "prohibited",
          "public_entry_required": true,
          "forbidden_imports": []
        }
      }
    },
    "slice_internal": {
      "slice-internal-ts": {
        "sub_layers": [
          "domain",
          "application",
          "infrastructure",
          "presentation",
          "tests"
        ],
        "rules": [
          {
            "from": "presentation",
            "allow": [
              "application",
              "domain"
            ]
          },
          {
            "from": "application",
            "allow": [
              "domain"
            ]
          },
          {
            "from": "infrastructure",
            "allow": [
              "domain"
            ]
          },
          {
            "from": "domain",
            "allow": []
          },
          {
            "from": "tests",
            "allow": [
              "domain",
              "application",
              "infrastructure",
              "presentation"
            ]
          }
        ]
      }
    },
    "cross_slice": {
      "prohibited_direct": true,
      "via": [
        "shared/contracts",
        "shared/events"
      ]
    },
    "cross_bc": {
      "via": [
        "apps/myapp/src/shared/contracts",
        "apps/myapp/src/shared/events"
      ],
      "same_event_bus": true
    },
    "cross_root": [],
    "page_map_marker": "phase-11b",
    "phase_hooks": {}
  },
  "typescriptTauri": {
    "version": 1,
    "default_root": "ts",
    "roots": [
      {
        "id": "ts",
        "app": "myapp",
        "path": "apps/myapp/src",
        "language": "typescript",
        "layer_set": "ddd-vsa-hex-ts",
        "adapter": "eslint",
        "slice_root": "task-management",
        "slice_subdir": "slices",
        "public_entry": "index.ts"
      },
      {
        "id": "rs",
        "app": "myapp",
        "path": "apps/myapp/src-tauri/src",
        "language": "rust",
        "layer_set": "ddd-vsa-hex-rs",
        "adapter": "rust",
        "slice_root": "task_management",
        "slice_subdir": "slices",
        "public_entry": "mod.rs"
      }
    ],
    "layer_sets": {
      "ddd-vsa-hex-ts": {
        "layers": [
          {
            "id": "shared",
            "kind": "shared"
          },
          {
            "id": "domain",
            "kind": "slice",
            "slice_internal": "slice-internal-ts"
          },
          {
            "id": "ui-widget",
            "kind": "ui-layer",
            "order": 1
          },
          {
            "id": "ui-page",
            "kind": "ui-layer",
            "order": 2
          }
        ],
        "rules": {
          "cross_layer": [
            {
              "from": "ui-page",
              "allow": [
                "ui-widget",
                "shared",
                "domain"
              ]
            },
            {
              "from": "ui-widget",
              "allow": [
                "shared",
                "domain"
              ]
            },
            {
              "from": "domain",
              "allow": [
                "shared"
              ]
            },
            {
              "from": "shared",
              "allow": []
            }
          ],
          "same_layer": "prohibited",
          "public_entry_required": true,
          "forbidden_imports": [
            {
              "from": "ui-widget",
              "modules": [
                "@tauri-apps/api/core"
              ],
              "reason": "use task-management/shared/ipc/* (tauri-specta-generated bindings) instead of raw invoke"
            },
            {
              "from": "ui-page",
              "modules": [
                "@tauri-apps/api/core"
              ],
              "reason": "use task-management/shared/ipc/* (tauri-specta-generated bindings) instead of raw invoke"
            }
          ]
        }
      },
      "ddd-vsa-hex-rs": {
        "layers": [
          {
            "id": "shared",
            "kind": "shared"
          },
          {
            "id": "domain",
            "kind": "slice",
            "slice_internal": "slice-internal-rs"
          }
        ],
        "rules": {
          "cross_layer": [
            {
              "from": "domain",
              "allow": [
                "shared"
              ]
            },
            {
              "from": "shared",
              "allow": []
            }
          ],
          "same_layer": "prohibited",
          "public_entry_required": true,
          "forbidden_imports": []
        }
      }
    },
    "slice_internal": {
      "slice-internal-ts": {
        "sub_layers": [
          "domain",
          "application",
          "infrastructure",
          "presentation",
          "tests"
        ],
        "rules": [
          {
            "from": "presentation",
            "allow": [
              "application",
              "domain"
            ]
          },
          {
            "from": "application",
            "allow": [
              "domain"
            ]
          },
          {
            "from": "infrastructure",
            "allow": [
              "domain"
            ]
          },
          {
            "from": "domain",
            "allow": []
          },
          {
            "from": "tests",
            "allow": [
              "domain",
              "application",
              "infrastructure",
              "presentation"
            ]
          }
        ]
      },
      "slice-internal-rs": {
        "sub_layers": [
          "domain",
          "application",
          "infrastructure",
          "presentation"
        ],
        "rules": [
          {
            "from": "presentation",
            "allow": [
              "application",
              "domain"
            ]
          },
          {
            "from": "application",
            "allow": [
              "domain",
              "infrastructure"
            ]
          },
          {
            "from": "infrastructure",
            "allow": [
              "domain"
            ]
          },
          {
            "from": "domain",
            "allow": []
          }
        ]
      }
    },
    "cross_slice": {
      "prohibited_direct": true,
      "via": [
        "shared/contracts",
        "shared/events"
      ]
    },
    "cross_bc": {
      "via": [
        "apps/myapp/src/shared/contracts",
        "apps/myapp/src/shared/events"
      ],
      "same_event_bus": true
    },
    "cross_root": [
      {
        "from": {
          "root": "rs",
          "path": "apps/myapp/src-tauri/src/task_management/slices/<slice_rs>/commands.rs"
        },
        "to": {
          "root": "ts",
          "path": "apps/myapp/src/task-management/shared/ipc/bindings.ts"
        },
        "generator": "tauri-specta",
        "auto_generated": true
      }
    ],
    "page_map_marker": null,
    "phase_hooks": {
      "flow-impl-red-pre": [
        {
          "cmd": "cargo run --bin export-types",
          "cwd": "apps/myapp/src-tauri",
          "reason": "regenerate tauri-specta bindings before authoring red boundary tests"
        }
      ],
      "flow-impl-green-post": [
        {
          "cmd": "cargo run --bin export-types",
          "cwd": "apps/myapp/src-tauri",
          "reason": "resync TS bindings after rust impl changes (DoD rule 4)"
        }
      ]
    }
  }
} as const;
