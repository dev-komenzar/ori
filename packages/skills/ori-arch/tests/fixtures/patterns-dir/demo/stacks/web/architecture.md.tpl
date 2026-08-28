---
version: 1
root:
  app: {{APP_NAME}}
  path: apps/{{APP_NAME}}/src
  language: typescript
  layer_set: ddd-vsa-hex-ts
  adapter: eslint
  slice_root: {{BC_NAME}}
  slice_subdir: slices
  public_entry: index.ts
layer_sets:
  ddd-vsa-hex-ts:
    layers:
      - { id: shared, kind: shared }
      - { id: domain, kind: slice, slice_internal: slice-internal-ts }
      - { id: ui-widget, kind: ui-layer, order: 1 }
      - { id: ui-page, kind: ui-layer, order: 2 }
    rules:
      cross_layer:
        - { from: ui-page, allow: [ui-widget, shared, domain] }
        - { from: ui-widget, allow: [shared, domain] }
        - { from: domain, allow: [shared] }
        - { from: shared, allow: [] }
      same_layer: prohibited
      public_entry_required: true
slice_internal:
  slice-internal-ts:
    sub_layers: [domain, application, infrastructure, presentation, tests]
    rules:
      - { from: presentation, allow: [application, domain] }
      - { from: application, allow: [domain] }
      - { from: infrastructure, allow: [domain] }
      - { from: domain, allow: [] }
      - { from: tests, allow: [domain, application, infrastructure, presentation] }
cross_slice:
  prohibited_direct: true
  via: [shared/contracts, shared/events]
---

# Architecture ({{APP_NAME}})

render-architecture テスト専用の最小 tpl (ori-c79.6)。
`--patterns-dir` で参照され、tpl 機構そのものの回帰検証に使う。

- app: {{APP_NAME}}
- bc: {{BC_NAME}}
- bc_rs: {{BC_NAME_RS}}