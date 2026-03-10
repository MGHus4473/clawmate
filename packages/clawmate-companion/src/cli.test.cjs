const test = require("node:test");
const assert = require("node:assert/strict");

const { __testing } = require("../bin/cli.cjs");

test("normalizeAgents keeps unique ids and sorts default agent first", () => {
  const result = __testing.normalizeAgents([
    { id: "work", workspace: "C:\\work" },
    { id: "main", workspace: "C:\\main", isDefault: true },
    { id: "work", workspace: "C:\\duplicate" },
  ]);

  assert.deepEqual(result, [
    { id: "main", workspace: "C:\\main", routes: [], bindings: undefined, isDefault: true },
    { id: "work", workspace: "C:\\work", routes: [], bindings: undefined, isDefault: false },
  ]);
});

test("buildConfigTargetMenu only shows finish option after at least one scope was configured", () => {
  const agents = [
    { id: "ding-main", workspace: "C:\\main", routes: [], bindings: undefined, isDefault: true },
    { id: "ding-work", workspace: "C:\\work", routes: [], bindings: undefined, isDefault: false },
  ];

  const initialMenu = __testing.buildConfigTargetMenu(agents, {}, false);
  assert.equal(initialMenu.values[0]?.type, "shared");
  assert.equal(initialMenu.values.at(-1)?.type, "agent");

  const followupMenu = __testing.buildConfigTargetMenu(agents, {}, true);
  assert.equal(followupMenu.values[0]?.type, "finish");
  assert.equal(followupMenu.values[1]?.type, "shared");
});

test("buildConfigTargetMenu marks configured agent overrides", () => {
  const agents = [
    { id: "ding-main", workspace: "C:\\main", routes: [], bindings: undefined, isDefault: true },
  ];

  const menu = __testing.buildConfigTargetMenu(agents, {
    selectedCharacter: "brooke",
    agents: {
      "ding-main": {
        selectedCharacter: "brooke-anime",
      },
    },
  }, true);

  assert.match(menu.items[1], /已配置|configured/);
  assert.match(menu.items[2], /已配置|configured/);
  assert.equal(menu.values[2]?.agentId, "ding-main");
});

test("resolveScopeSettings marks shared fields as unconfigured on fresh install", () => {
  const result = __testing.resolveScopeSettings({}, { type: "agent", agentId: "ding-main" });

  assert.deepEqual(result.shared.configured, {
    selectedCharacter: false,
    defaultProvider: false,
    proactiveSelfie: false,
  });
  assert.equal(result.currentCharacterId, "brooke");
  assert.equal(result.currentProviderKey, "mock");
  assert.deepEqual(result.currentProactiveSelfie, { enabled: false, probability: 0.1 });
});

test("resolveScopeSettings marks shared fields as configured when explicit shared config exists", () => {
  const result = __testing.resolveScopeSettings({
    selectedCharacter: "brooke-anime",
    defaultProvider: "openai-compatible",
    proactiveSelfie: { enabled: true, probability: 0.2 },
  }, { type: "agent", agentId: "ding-main" });

  assert.deepEqual(result.shared.configured, {
    selectedCharacter: true,
    defaultProvider: true,
    proactiveSelfie: true,
  });
});

test("buildPluginConfig applies shared defaults without changing agent overrides", () => {
  const result = __testing.buildPluginConfig({
    selectedCharacter: "brooke",
    defaultProvider: "openai-compatible",
    proactiveSelfie: { enabled: false, probability: 0.1 },
    providers: {
      "openai-compatible": { type: "openai-compatible", model: "gemini-imagen" },
    },
    agents: {
      main: {
        selectedCharacter: "brooke-anime",
        defaultProvider: "aliyun",
        proactiveSelfie: { enabled: true, probability: 0.3 },
        note: "keep-me",
      },
    },
  }, {
    scope: { type: "shared" },
    characterSelection: { mode: "set", value: "brooke-anime" },
    proactiveSelection: { mode: "set", value: { enabled: true, probability: 0.2 } },
    providerSelection: { mode: "set", providerKey: "aliyun" },
    providerConfigs: {
      aliyun: { type: "aliyun", model: "wan2.6-image" },
    },
    defaultUserCharacterRoot: "C:\\Users\\tester\\.openclaw\\clawmeta",
  });

  assert.equal(result.selectedCharacter, "brooke-anime");
  assert.equal(result.defaultProvider, "aliyun");
  assert.deepEqual(result.proactiveSelfie, { enabled: true, probability: 0.2 });
  assert.deepEqual(result.providers, {
    "openai-compatible": { type: "openai-compatible", model: "gemini-imagen" },
    aliyun: { type: "aliyun", model: "wan2.6-image" },
  });
  assert.deepEqual(result.agents, {
    main: {
      selectedCharacter: "brooke-anime",
      defaultProvider: "aliyun",
      proactiveSelfie: { enabled: true, probability: 0.3 },
      note: "keep-me",
    },
  });
  assert.equal(result.userCharacterRoot, "C:\\Users\\tester\\.openclaw\\clawmeta");
});

test("buildPluginConfig can clear shared defaults without removing provider definitions or agent overrides", () => {
  const result = __testing.buildPluginConfig({
    selectedCharacter: "brooke",
    defaultProvider: "openai-compatible",
    proactiveSelfie: { enabled: true, probability: 0.2 },
    providers: {
      "openai-compatible": { type: "openai-compatible", model: "gemini-imagen" },
    },
    agents: {
      "ding-main": {
        selectedCharacter: "brooke-anime",
      },
    },
  }, {
    scope: { type: "shared" },
    characterSelection: { mode: "clear" },
    proactiveSelection: { mode: "clear" },
    providerSelection: { mode: "clear" },
    providerConfigs: {},
    defaultUserCharacterRoot: "C:\\Users\\tester\\.openclaw\\clawmeta",
  });

  assert.equal("selectedCharacter" in result, false);
  assert.equal("defaultProvider" in result, false);
  assert.equal("proactiveSelfie" in result, false);
  assert.deepEqual(result.providers, {
    "openai-compatible": { type: "openai-compatible", model: "gemini-imagen" },
  });
  assert.deepEqual(result.agents, {
    "ding-main": {
      selectedCharacter: "brooke-anime",
    },
  });
});

test("buildPluginConfig updates only the selected agent overrides", () => {
  const result = __testing.buildPluginConfig({
    selectedCharacter: "brooke",
    defaultProvider: "openai-compatible",
    proactiveSelfie: { enabled: false, probability: 0.1 },
    agents: {
      main: {
        selectedCharacter: "legacy-main",
        note: "keep-main",
      },
      "ding-work": {
        selectedCharacter: "legacy-work",
        defaultProvider: "aliyun",
        proactiveSelfie: { enabled: true, probability: 0.3 },
      },
    },
  }, {
    scope: { type: "agent", agentId: "ding-work" },
    characterSelection: { mode: "set", value: "brooke-anime" },
    proactiveSelection: { mode: "set", value: { enabled: true, probability: 0.2 } },
    providerSelection: { mode: "set", providerKey: "fal" },
    providerConfigs: {
      fal: { type: "fal", model: "fal-ai/flux/dev/image-to-image" },
    },
    defaultUserCharacterRoot: "C:\\Users\\tester\\.openclaw\\clawmeta",
  });

  assert.deepEqual(result.agents, {
    main: {
      selectedCharacter: "legacy-main",
      note: "keep-main",
    },
    "ding-work": {
      selectedCharacter: "brooke-anime",
      defaultProvider: "fal",
      proactiveSelfie: { enabled: true, probability: 0.2 },
    },
  });
  assert.deepEqual(result.providers, {
    fal: { type: "fal", model: "fal-ai/flux/dev/image-to-image" },
  });
});

test("buildPluginConfig writes explicit agent overrides even when they match shared values", () => {
  const result = __testing.buildPluginConfig({
    selectedCharacter: "brooke",
    defaultProvider: "openai-compatible",
    proactiveSelfie: { enabled: false, probability: 0.1 },
  }, {
    scope: { type: "agent", agentId: "ding-main" },
    characterSelection: { mode: "set", value: "brooke" },
    proactiveSelection: { mode: "set", value: { enabled: false, probability: 0.1 } },
    providerSelection: { mode: "set", providerKey: "openai-compatible" },
    providerConfigs: {},
    defaultUserCharacterRoot: "C:\\Users\\tester\\.openclaw\\clawmeta",
  });

  assert.deepEqual(result.agents, {
    "ding-main": {
      selectedCharacter: "brooke",
      defaultProvider: "openai-compatible",
      proactiveSelfie: { enabled: false, probability: 0.1 },
    },
  });
});

test("buildPluginConfig can clear a selected agent override back to shared settings", () => {
  const result = __testing.buildPluginConfig({
    selectedCharacter: "brooke",
    defaultProvider: "openai-compatible",
    proactiveSelfie: { enabled: false, probability: 0.1 },
    agents: {
      main: {
        selectedCharacter: "brooke-anime",
        defaultProvider: "aliyun",
        proactiveSelfie: { enabled: true, probability: 0.3 },
        note: "keep-me",
      },
    },
  }, {
    scope: { type: "agent", agentId: "main" },
    characterSelection: { mode: "inherit" },
    proactiveSelection: { mode: "inherit" },
    providerSelection: { mode: "inherit" },
    providerConfigs: {},
    defaultUserCharacterRoot: "C:\\Users\\tester\\.openclaw\\clawmeta",
  });

  assert.deepEqual(result.agents, {
    main: {
      note: "keep-me",
    },
  });
});
