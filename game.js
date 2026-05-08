let gameData;

// ========================== UI 篩選狀態（鍛造/背包裝備） ==========================
const uiState = {
    forgeFilter: {
        setId: "all",      // all | none | <setId>
        level: "all",      // all | <number>（配方等級）
        slot: "all",       // all | rightHand | leftHand | hat | chest | pants | shoes | accessory
        craftableOnly: false
    },
    bagEquipFilter: {
        setId: "all",      // all | none | <setId>
        level: "all",      // all | <number>（裝備強化等級）
        slot: "all"        // all | rightHand | leftHand | hat | chest | pants | shoes | accessory
    }
};

const SLOT_LABELS = {
    rightHand: "右手",
    leftHand: "左手",
    hat: "帽子",
    chest: "衣服",
    pants: "護腿",
    shoes: "鞋子",
    accessory: "飾品"
};

// ========================== 飾品特殊效果（事件鉤子系統） ==========================
// 設計目標：
// - 不破壞既有裝備/鍛造/存檔結構
// - 讓飾品能提供「非純數值」的玩法效果（戰鬥/地下城/採集）
//
// 事件種類：
// - battleStart: { mode: 'field'|'dungeon', enemy }
// - beforePlayerAttack: { mode, enemy, damage }
// - afterPlayerAttack: { mode, enemy, damageDealt }
// - beforeEnemyAttack: { mode, enemy, damage }
// - afterEnemyAttack: { mode, enemy, damageDealt }
// - victory: { mode, enemy, drops }
// - gather: { area, mat, count }

function getEquippedAccessories() {
    const eq = gameData?.equipped || {};
    const list = [];
    for (let i = 1; i <= 5; i++) {
        const it = eq[`accessory${i}`];
        if (it && typeof it === "object") list.push(it);
    }
    return list;
}

// ========================== 飾品效果：等級縮放工具 ==========================
// 目標：讓同一個 effectId 能隨飾品強化等級而提升「觸發率/數值」。
// 注意：這裡的 lv 是「裝備實例等級」，最低 1。
function getItemLevelSafe(item) {
    const lv = Math.max(1, Number(item?.level) || 1);
    return lv;
}

function scaleChance(base, lv, step = 0.02, max = 0.75) {
    // base: 基礎機率 (0~1)
    // step: 每級+機率
    const p = Number(base) + (Math.max(1, Number(lv) || 1) - 1) * Number(step);
    return clamp(p, 0, max);
}

function scaleValue(base, lv, step = 0.08) {
    // base: 基礎數值
    // step: 每級+百分比（0.08=每級+8%）
    const x = Number(base) * (1 + (Math.max(1, Number(lv) || 1) - 1) * Number(step));
    // 以整數顯示/計算較直覺
    return Math.max(0, Math.floor(x));
}

function fmtPct(p) {
    const n = Math.round(clamp(p, 0, 1) * 100);
    return `${n}%`;
}

function getEffectDescForLevel(effectId, lv) {
    const ef = ACCESSORY_EFFECTS?.[effectId];
    if (!ef) return "";
    try {
        if (typeof ef.getDesc === "function") return String(ef.getDesc(lv));
    } catch (e) {
        console.warn("effect getDesc error", effectId, e);
    }
    return String(ef.desc || "");
}

function getItemSpecialEffectText(item) {
    // 目前：飾品用 effectIds；未來可擴充到武器詞綴、套裝特效等。
    const lv = getItemLevelSafe(item);
    const ids = item?.effectIds || EQUIPMENTS?.[item?.id]?.effectIds;
    if (!Array.isArray(ids) || ids.length === 0) return "";
    const lines = ids.map(id => `- ${getEffectDescForLevel(id, lv)}`).filter(Boolean);
    return lines.length ? `特殊效果：\n${lines.join("\n")}` : "";
}

function getAccessoryEffectIds() {
    // 以「實例」上的 effectIds 為主（便於未來做隨機詞綴）
    // 若舊存檔沒有 effectIds，則回退到 EQUIPMENTS 模板。
    const accs = getEquippedAccessories();
    const out = [];
    for (const it of accs) {
        const ids = it.effectIds || EQUIPMENTS?.[it.id]?.effectIds;
        if (Array.isArray(ids)) out.push(...ids);
    }
    return out;
}

function getAccessoryEffects() {
    // 回傳「效果 + 裝備實例」配對，讓效果可以讀到等級。
    const accs = getEquippedAccessories();
    const out = [];
    for (const it of accs) {
        const ids = it.effectIds || EQUIPMENTS?.[it.id]?.effectIds;
        if (!Array.isArray(ids)) continue;
        for (const id of ids) {
            const ef = ACCESSORY_EFFECTS[id];
            if (ef) out.push({ ef, item: it });
        }
    }
    return out;
}

function triggerAccessoryEvent(eventName, ctx) {
    // ctx 會被各效果讀寫；回傳 ctx 方便 caller 串接。
    const effects = getAccessoryEffects();
    for (const row of effects) {
        try {
            const ef = row?.ef;
            const item = row?.item;
            const fn = ef?.[eventName];
            if (typeof fn === "function") {
                // 附加常用欄位（不影響舊效果：多的參數 JS 會忽略）
                fn(ctx, {
                    item,
                    lv: getItemLevelSafe(item)
                });
            }
        } catch (e) {
            console.warn("Accessory effect error", row?.ef?.id, eventName, e);
        }
    }
    return ctx;
}

// ========================== 套裝特殊效果（事件鉤子系統） ==========================
// 需求：讓套裝效果不再只有屬性提升，也能像飾品一樣提供特殊效果。
// 做法：
// - SETS 仍保留 bonuses（屬性加成）
// - 另以 SET_EFFECTS 定義各套裝的特殊效果（事件：battleStart/beforePlayerAttack/.../gather/victory）

function getEquippedSetCounts() {
    const equip = gameData?.equipped || {};
    const counts = {};
    for (const slot in equip) {
        const it = equip[slot];
        const setId = it?.setId;
        if (!setId) continue;
        counts[setId] = (counts[setId] || 0) + 1;
    }
    return counts;
}

function getActiveSetEffects() {
    // 回傳：[{ setId, tier, ef }]
    const counts = getEquippedSetCounts();
    const out = [];
    for (const setId in counts) {
        const pieces = counts[setId];
        const def = SET_EFFECTS?.[setId];
        if (!def) continue;
        const tiers = Object.keys(def.tiers || {})
            .map(n => Number(n))
            .filter(n => !Number.isNaN(n))
            .sort((a, b) => a - b);
        for (const t of tiers) {
            if (pieces >= t) {
                const ef = def.tiers[t];
                if (ef) out.push({ setId, tier: t, ef });
            }
        }
    }
    return out;
}

function triggerSetEvent(eventName, ctx) {
    const effects = getActiveSetEffects();
    for (const row of effects) {
        try {
            const fn = row?.ef?.[eventName];
            if (typeof fn === "function") fn(ctx, { setId: row.setId, tier: row.tier });
        } catch (e) {
            console.warn("Set effect error", row?.setId, row?.tier, eventName, e);
        }
    }
    return ctx;
}

function getSetEffectDesc(setId, tier) {
    const def = SET_EFFECTS?.[setId];
    const ef = def?.tiers?.[tier];
    if (!ef) return "";
    if (typeof ef.getDesc === "function") {
        try { return String(ef.getDesc()); } catch { /* ignore */ }
    }
    return String(ef.desc || "");
}

// 套裝特殊效果定義：每套至少 2 件 / 4 件各一個效果
const SET_EFFECTS = {
    traveler: {
        name: "旅人套裝",
        tiers: {
            2: {
                desc: "戰鬥開始獲得護盾（吸收 10 點傷害）。",
                getDesc() { return "戰鬥開始獲得護盾（吸收 10 點傷害）。"; },
                battleStart(ctx) {
                    const c = ctx.char;
                    c.__shield = (c.__shield || 0) + 10;
                    ctx.logLines?.push(addBattleLogLine("🧩 套裝：旅人(2) 開戰護盾 +10"));
                }
            },
            4: {
                desc: "採集時 20% 額外獲得 +1 份素材。",
                getDesc() { return "採集時 20% 額外獲得 +1 份素材。"; },
                gather(ctx) {
                    if (!chance(0.20)) return;
                    ctx.count += 1;
                    ctx.toastSuffix = (ctx.toastSuffix || "") + "（旅人套裝+1）";
                }
            }
        }
    },
    guard: {
        name: "守卫套装",
        tiers: {
            2: {
                desc: "受到攻擊前 12% 使本次受到的傷害 -40%。",
                getDesc() { return "受到攻擊前 12% 使本次受到的傷害 -40%。"; },
                beforeEnemyAttack(ctx) {
                    if (!chance(0.12)) return;
                    ctx.damage = Math.max(0, Math.floor((ctx.damage || 0) * 0.60));
                    ctx.logLines?.push(addBattleLogLine("🧩 套裝：守卫(2) 格擋成功（受傷-40%）"));
                }
            },
            4: {
                desc: "當你仍有護盾時，你的攻擊傷害 +15%。",
                getDesc() { return "當你仍有護盾時，你的攻擊傷害 +15%。"; },
                beforePlayerAttack(ctx) {
                    if ((ctx.char.__shield || 0) <= 0) return;
                    ctx.damage = Math.floor((ctx.damage || 0) * 1.15);
                }
            }
        }
    },
    ranger: {
        name: "游侠套装",
        tiers: {
            2: {
                desc: "攻擊後 12% 追加一次 40% 傷害的追擊。",
                getDesc() { return "攻擊後 12% 追加一次 40% 傷害的追擊。"; },
                afterPlayerAttack(ctx) {
                    if (!chance(0.12)) return;
                    const dmg = Math.max(1, Math.floor((ctx.damageDealt || 0) * 0.40));
                    ctx.enemy.hp -= dmg;
                    ctx.logLines?.push(addBattleLogLine(`🧩 套裝：游侠(2) 追擊造成 ${dmg} 傷害`));
                }
            },
            4: {
                desc: "勝利後 20% 額外獲得 魔法水晶 x1。",
                getDesc() { return "勝利後 20% 額外獲得 魔法水晶 x1。"; },
                victory(ctx) {
                    if (!chance(0.20)) return;
                    ctx.drops.crystal = (ctx.drops.crystal || 0) + 1;
                    ctx.logLines?.push(addBattleLogLine("🧩 套裝：游侠(4) 額外掉落 水晶x1"));
                }
            }
        }
    },
    mage: {
        name: "法师套装",
        tiers: {
            2: {
                desc: "戰鬥開始回復 8 MP。",
                getDesc() { return "戰鬥開始回復 8 MP。"; },
                battleStart(ctx) {
                    const c = ctx.char;
                    c.mp = Math.min(ctx.total.mpMax, (c.mp || 0) + 8);
                    ctx.logLines?.push(addBattleLogLine("🧩 套裝：法师(2) 開戰回魔 +8"));
                }
            },
            4: {
                desc: "攻擊時 18% 追加相當於敵人防禦 35% 的傷害（穿甲）。",
                getDesc() { return "攻擊時 18% 追加相當於敵人防禦 35% 的傷害（穿甲）。"; },
                beforePlayerAttack(ctx) {
                    if (!chance(0.18)) return;
                    const extra = Math.max(1, Math.floor((ctx.enemy?.def || 0) * 0.35));
                    ctx.damage = (ctx.damage || 0) + extra;
                    ctx.logLines?.push(addBattleLogLine(`🧩 套裝：法师(4) 穿甲追加 +${extra}`));
                }
            }
        }
    },
    shadow: {
        name: "暗影套装",
        tiers: {
            2: {
                desc: "地下城戰鬥開始時 20% 先手造成 10 點傷害。",
                getDesc() { return "地下城戰鬥開始時 20% 先手造成 10 點傷害。"; },
                battleStart(ctx) {
                    if (ctx.mode !== "dungeon") return;
                    if (!chance(0.20)) return;
                    ctx.enemy.hp -= 10;
                    ctx.logLines?.push(addBattleLogLine("🧩 套裝：暗影(2) 先手突襲 -10"));
                }
            },
            4: {
                desc: "攻擊後 10% 吸血：回復本次造成傷害的 15%（上限 18）。",
                getDesc() { return "攻擊後 10% 吸血：回復本次造成傷害的 15%（上限 18）。"; },
                afterPlayerAttack(ctx) {
                    if (!chance(0.10)) return;
                    const heal = clamp(Math.floor((ctx.damageDealt || 0) * 0.15), 0, 18);
                    if (heal <= 0) return;
                    ctx.char.hp = Math.min(ctx.total.hpMax, (ctx.char.hp || 0) + heal);
                    ctx.logLines?.push(addBattleLogLine(`🧩 套裝：暗影(4) 吸血回復 ${heal} HP`));
                }
            }
        }
    },
    volcanic: {
        name: "火山套装",
        tiers: {
            2: {
                desc: "攻擊時 10% 造成額外 8 點灼熱傷害。",
                getDesc() { return "攻擊時 10% 造成額外 8 點灼熱傷害。"; },
                afterPlayerAttack(ctx) {
                    if (!chance(0.10)) return;
                    const dmg = 8;
                    ctx.enemy.hp -= dmg;
                    ctx.logLines?.push(addBattleLogLine(`🧩 套裝：火山(2) 灼熱追加 ${dmg} 傷害`));
                }
            },
            4: {
                desc: "戰鬥開始獲得護盾（吸收 20 點傷害）。",
                getDesc() { return "戰鬥開始獲得護盾（吸收 20 點傷害）。"; },
                battleStart(ctx) {
                    const c = ctx.char;
                    c.__shield = (c.__shield || 0) + 20;
                    ctx.logLines?.push(addBattleLogLine("🧩 套裝：火山(4) 開戰護盾 +20"));
                }
            }
        }
    },
    holy: {
        name: "圣光套装",
        tiers: {
            2: {
                desc: "勝利後回復 10 HP 與 6 MP。",
                getDesc() { return "勝利後回復 10 HP 與 6 MP。"; },
                victory(ctx) {
                    const c = ctx.char;
                    c.hp = Math.min(ctx.total.hpMax, (c.hp || 0) + 10);
                    c.mp = Math.min(ctx.total.mpMax, (c.mp || 0) + 6);
                    ctx.logLines?.push(addBattleLogLine("🧩 套裝：圣光(2) 勝利回復 HP+10 MP+6"));
                }
            },
            4: {
                desc: "每場戰鬥 1 次：受到致命傷害時保留 1 HP。",
                getDesc() { return "每場戰鬥 1 次：受到致命傷害時保留 1 HP。"; },
                battleStart(ctx) {
                    ctx.char.__holyCheatUsed = false;
                },
                beforeEnemyAttack(ctx) {
                    const c = ctx.char;
                    if (c.__holyCheatUsed) return;
                    const incoming = ctx.damage || 0;
                    if ((c.hp || 0) - incoming <= 0) {
                        ctx.damage = Math.max(0, (c.hp || 0) - 1);
                        c.__holyCheatUsed = true;
                        ctx.logLines?.push(addBattleLogLine("🧩 套裝：圣光(4) 神佑（保留 1HP）"));
                    }
                }
            }
        }
    },
    abyss: {
        name: "深渊套装",
        tiers: {
            2: {
                desc: "敵人攻擊前 15% 使其本次傷害 -35%。",
                getDesc() { return "敵人攻擊前 15% 使其本次傷害 -35%。"; },
                beforeEnemyAttack(ctx) {
                    if (!chance(0.15)) return;
                    ctx.damage = Math.max(0, Math.floor((ctx.damage || 0) * 0.65));
                    ctx.logLines?.push(addBattleLogLine("🧩 套裝：深渊(2) 低語壓制（敵傷害-35%）"));
                }
            },
            4: {
                desc: "攻擊時 12% 造成二連擊（第二擊 50% 傷害）。",
                getDesc() { return "攻擊時 12% 造成二連擊（第二擊 50% 傷害）。"; },
                afterPlayerAttack(ctx) {
                    if (!chance(0.12)) return;
                    const dmg = Math.max(1, Math.floor((ctx.damageDealt || 0) * 0.50));
                    ctx.enemy.hp -= dmg;
                    ctx.logLines?.push(addBattleLogLine(`🧩 套裝：深渊(4) 二連擊追加 ${dmg} 傷害`));
                }
            }
        }
    }
};

function clamp(n, min, max) {
    const x = Number(n);
    if (Number.isNaN(x)) return min;
    return Math.max(min, Math.min(max, x));
}

function chance(p) {
    return Math.random() < clamp(p, 0, 1);
}

function addBattleLogLine(text) {
    if (!text) return;
    // 戰鬥 UI 目前會用 log.replace 重新渲染；這裡只負責拼字串（由呼叫端放進 log）
    // 保留此函式以便未來改成統一 log collector。
    return String(text);
}

// 15+ 種飾品特效（可疊加）
const ACCESSORY_EFFECTS = {
    // 1) 開戰獲得護盾（一次性吸收傷害）
    ward_start_shield: {
        id: "ward_start_shield",
        name: "開戰護盾",
        desc: "戰鬥開始獲得護盾（吸收 15 點傷害），直到被打破。",
        getDesc(lv) {
            const shield = scaleValue(15, lv, 0.10);
            return `戰鬥開始獲得護盾（吸收 ${shield} 點傷害），直到被打破。`;
        },
        battleStart(ctx, meta) {
            const lv = meta?.lv || 1;
            const c = ctx.char;
            const shield = scaleValue(15, lv, 0.10);
            c.__shield = (c.__shield || 0) + shield;
            ctx.logLines?.push(addBattleLogLine(`🛡️ 飾品：開戰護盾啟動（護盾+${shield}）`));
        }
    },
    // 2) 反擊：受到攻擊後 20% 追加反擊 35% 傷害
    thorn_counter: {
        id: "thorn_counter",
        name: "荊棘反擊",
        desc: "受到攻擊後 20% 反擊（造成 35% 你本次受到的傷害）。",
        getDesc(lv) {
            const p = scaleChance(0.20, lv, 0.02, 0.55);
            const ratio = clamp(0.35 + (lv - 1) * 0.02, 0.35, 0.75);
            return `受到攻擊後 ${fmtPct(p)} 反擊（造成 ${Math.round(ratio * 100)}% 你本次受到的傷害）。`;
        },
        afterEnemyAttack(ctx, meta) {
            const lv = meta?.lv || 1;
            const p = scaleChance(0.20, lv, 0.02, 0.55);
            if (!chance(p)) return;
            const ratio = clamp(0.35 + (lv - 1) * 0.02, 0.35, 0.75);
            const dmg = Math.max(1, Math.floor((ctx.damageDealt || 0) * ratio));
            ctx.enemy.hp -= dmg;
            ctx.logLines?.push(addBattleLogLine(`🌵 飾品反擊造成 ${dmg} 傷害`));
        }
    },
    // 3) 處決：敵方血量低於 12% 時，玩家傷害+50%
    execute_lowhp: {
        id: "execute_lowhp",
        name: "處決者",
        desc: "敵人生命低於 12% 時，你的攻擊傷害 +50%。",
        getDesc(lv) {
            const threshold = clamp(0.12 + (lv - 1) * 0.01, 0.12, 0.25);
            const mult = clamp(1.5 + (lv - 1) * 0.05, 1.5, 2.2);
            return `敵人生命低於 ${Math.round(threshold * 100)}% 時，你的攻擊傷害 +${Math.round((mult - 1) * 100)}%。`;
        },
        beforePlayerAttack(ctx, meta) {
            const lv = meta?.lv || 1;
            const e = ctx.enemy;
            if (!e?.hpMax) return;
            const threshold = clamp(0.12 + (lv - 1) * 0.01, 0.12, 0.25);
            const mult = clamp(1.5 + (lv - 1) * 0.05, 1.5, 2.2);
            if ((e.hp / e.hpMax) <= threshold) {
                ctx.damage = Math.floor((ctx.damage || 0) * mult);
                ctx.logLines?.push(addBattleLogLine("⚔️ 飾品：處決者發動（傷害+50%）"));
            }
        }
    },
    // 4) 穿甲：每次攻擊 25% 無視 50% 防禦（簡化為+傷害）
    pierce_armor: {
        id: "pierce_armor",
        name: "穿甲刻印",
        desc: "攻擊時 25% 機率穿甲：額外造成相當於敵人防禦 50% 的傷害。",
        getDesc(lv) {
            const p = scaleChance(0.25, lv, 0.02, 0.60);
            const ratio = clamp(0.50 + (lv - 1) * 0.03, 0.50, 1.10);
            return `攻擊時 ${fmtPct(p)} 機率穿甲：額外造成相當於敵人防禦 ${Math.round(ratio * 100)}% 的傷害。`;
        },
        beforePlayerAttack(ctx, meta) {
            const lv = meta?.lv || 1;
            const p = scaleChance(0.25, lv, 0.02, 0.60);
            if (!chance(p)) return;
            const ratio = clamp(0.50 + (lv - 1) * 0.03, 0.50, 1.10);
            const extra = Math.max(1, Math.floor((ctx.enemy?.def || 0) * ratio));
            ctx.damage = (ctx.damage || 0) + extra;
            ctx.logLines?.push(addBattleLogLine(`🪓 飾品：穿甲追加 +${extra}`));
        }
    },
    // 5) 吸血：造成傷害的 15% 轉為治療（每擊最多 12）
    vampiric: {
        id: "vampiric",
        name: "嗜血",
        desc: "你造成傷害的 15% 轉為治療（每次最多 12）。",
        getDesc(lv) {
            const ratio = clamp(0.15 + (lv - 1) * 0.01, 0.15, 0.28);
            const cap = scaleValue(12, lv, 0.12);
            return `你造成傷害的 ${Math.round(ratio * 100)}% 轉為治療（每次最多 ${cap}）。`;
        },
        afterPlayerAttack(ctx, meta) {
            const lv = meta?.lv || 1;
            const ratio = clamp(0.15 + (lv - 1) * 0.01, 0.15, 0.28);
            const cap = scaleValue(12, lv, 0.12);
            const heal = clamp(Math.floor((ctx.damageDealt || 0) * ratio), 0, cap);
            if (heal <= 0) return;
            ctx.char.hp = Math.min(ctx.total.hpMax, (ctx.char.hp || 0) + heal);
            ctx.logLines?.push(addBattleLogLine(`🩸 飾品：嗜血回復 ${heal} HP`));
        }
    },
    // 6) 連擊：10% 機率打出第二擊（50% 傷害）
    double_strike: {
        id: "double_strike",
        name: "連擊",
        desc: "攻擊後 10% 追加一次 50% 傷害的追擊。",
        getDesc(lv) {
            const p = scaleChance(0.10, lv, 0.015, 0.40);
            const ratio = clamp(0.50 + (lv - 1) * 0.03, 0.50, 1.00);
            return `攻擊後 ${fmtPct(p)} 追加一次 ${Math.round(ratio * 100)}% 傷害的追擊。`;
        },
        afterPlayerAttack(ctx, meta) {
            const lv = meta?.lv || 1;
            const p = scaleChance(0.10, lv, 0.015, 0.40);
            if (!chance(p)) return;
            const ratio = clamp(0.50 + (lv - 1) * 0.03, 0.50, 1.00);
            const dmg = Math.max(1, Math.floor((ctx.damageDealt || 0) * ratio));
            ctx.enemy.hp -= dmg;
            ctx.logLines?.push(addBattleLogLine(`⚡ 飾品：追擊造成 ${dmg} 傷害`));
        }
    },
    // 7) 祈福：勝利後 25% 額外掉落 1 個水晶（或同區域素材）
    blessing_extra_drop: {
        id: "blessing_extra_drop",
        name: "祝福贈禮",
        desc: "勝利後 25% 額外獲得 1 個魔法水晶。",
        getDesc(lv) {
            const p = scaleChance(0.25, lv, 0.02, 0.65);
            const extra = Math.max(1, 1 + Math.floor((lv - 1) / 4));
            return `勝利後 ${fmtPct(p)} 額外獲得 魔法水晶 x${extra}。`;
        },
        victory(ctx, meta) {
            const lv = meta?.lv || 1;
            const p = scaleChance(0.25, lv, 0.02, 0.65);
            if (!chance(p)) return;
            const extra = Math.max(1, 1 + Math.floor((lv - 1) / 4));
            ctx.drops.crystal = (ctx.drops.crystal || 0) + extra;
            ctx.logLines?.push(addBattleLogLine("✨ 飾品：祝福贈禮（額外掉落 水晶x1）"));
        }
    },
    // 8) 採集幸運：採集時 30% 額外 +1
    gather_lucky: {
        id: "gather_lucky",
        name: "採集幸運",
        desc: "採集時 30% 額外獲得 +1 份素材。",
        getDesc(lv) {
            const p = scaleChance(0.30, lv, 0.02, 0.70);
            const extra = Math.max(1, 1 + Math.floor((lv - 1) / 3));
            return `採集時 ${fmtPct(p)} 額外獲得 +${extra} 份素材。`;
        },
        gather(ctx, meta) {
            const lv = meta?.lv || 1;
            const p = scaleChance(0.30, lv, 0.02, 0.70);
            if (!chance(p)) return;
            const extra = Math.max(1, 1 + Math.floor((lv - 1) / 3));
            ctx.count += extra;
            ctx.toastSuffix = (ctx.toastSuffix || "") + "（幸運+1）";
        }
    },
    // 9) 採集轉化：採到 herb 時 20% 變成 red_herb
    gather_refine_herb: {
        id: "gather_refine_herb",
        name: "草藥提純",
        desc: "採到藥草時 20% 轉化為紅藥草。",
        getDesc(lv) {
            const p = scaleChance(0.20, lv, 0.02, 0.65);
            return `採到藥草時 ${fmtPct(p)} 轉化為紅藥草。`;
        },
        gather(ctx, meta) {
            const lv = meta?.lv || 1;
            if (ctx.mat !== "herb") return;
            const p = scaleChance(0.20, lv, 0.02, 0.65);
            if (!chance(p)) return;
            ctx.mat = "red_herb";
            ctx.toastSuffix = (ctx.toastSuffix || "") + "（提純）";
        }
    },
    // 10) 地下城先手猛攻：地下城戰鬥開始時 20% 直接造成 10 傷害
    dungeon_first_blood: {
        id: "dungeon_first_blood",
        name: "先手猛攻",
        desc: "地下城戰鬥開始時 20% 先手造成 10 點傷害。",
        getDesc(lv) {
            const p = scaleChance(0.20, lv, 0.02, 0.60);
            const dmg = scaleValue(10, lv, 0.12);
            return `地下城戰鬥開始時 ${fmtPct(p)} 先手造成 ${dmg} 點傷害。`;
        },
        battleStart(ctx, meta) {
            const lv = meta?.lv || 1;
            if (ctx.mode !== "dungeon") return;
            const p = scaleChance(0.20, lv, 0.02, 0.60);
            if (!chance(p)) return;
            const dmg = scaleValue(10, lv, 0.12);
            ctx.enemy.hp -= dmg;
            ctx.logLines?.push(addBattleLogLine(`💥 飾品：先手猛攻（-${dmg}）`));
        }
    },
    // 11) 防爆：受到致命一擊時（HP 將降到 0 以下）改為保留 1 HP（每場 1 次）
    cheat_death_once: {
        id: "cheat_death_once",
        name: "不屈護符",
        desc: "每場戰鬥 1 次：受到致命傷害時保留 1 HP。",
        beforeEnemyAttack(ctx, meta) {
            const c = ctx.char;
            if (c.__cheatDeathUsed) return;
            // 用「即將受到的傷害」判定
            const incoming = ctx.damage || 0;
            if ((c.hp || 0) - incoming <= 0) {
                // 把傷害改成只扣到 1
                ctx.damage = Math.max(0, (c.hp || 0) - 1);
                c.__cheatDeathUsed = true;
                ctx.logLines?.push(addBattleLogLine("🪽 飾品：不屈護符發動（保留 1HP）"));
            }
        },
        battleStart(ctx) {
            ctx.char.__cheatDeathUsed = false;
        }
    },
    // 12) 風暴刻印：每 3 次攻擊，下一擊追加 8 雷傷（簡化為固定加傷）
    storm_charge: {
        id: "storm_charge",
        name: "風暴蓄能",
        desc: "每 3 次攻擊後，下一擊追加 8 點傷害。",
        getDesc(lv) {
            const need = Math.max(1, 3 - Math.floor((lv - 1) / 4));
            const extra = scaleValue(8, lv, 0.12);
            return `每 ${need} 次攻擊後，下一擊追加 ${extra} 點傷害。`;
        },
        beforePlayerAttack(ctx, meta) {
            const lv = meta?.lv || 1;
            const need = Math.max(1, 3 - Math.floor((lv - 1) / 4));
            const extra = scaleValue(8, lv, 0.12);
            const c = ctx.char;
            c.__stormCount = c.__stormCount || 0;
            if (c.__stormCount >= need) {
                ctx.damage += extra;
                c.__stormCount = 0;
                ctx.logLines?.push(addBattleLogLine(`🌩️ 飾品：風暴蓄能釋放（+${extra}）`));
            }
        },
        afterPlayerAttack(ctx) {
            const c = ctx.char;
            c.__stormCount = (c.__stormCount || 0) + 1;
        }
    },
    // 13) 延緩：敵人攻擊前 12% 機率讓其本回合傷害 -40%（驚嚇/遲滯）
    weaken_enemy: {
        id: "weaken_enemy",
        name: "遲滯凝視",
        desc: "敵人攻擊前 12% 機率使其傷害降低 40%。",
        getDesc(lv) {
            const p = scaleChance(0.12, lv, 0.015, 0.45);
            const ratio = clamp(0.60 - (lv - 1) * 0.015, 0.35, 0.60); // 越高越痛：剩餘比例越低
            return `敵人攻擊前 ${fmtPct(p)} 機率使其傷害降低 ${Math.round((1 - ratio) * 100)}%。`;
        },
        beforeEnemyAttack(ctx, meta) {
            const lv = meta?.lv || 1;
            const p = scaleChance(0.12, lv, 0.015, 0.45);
            if (!chance(p)) return;
            const ratio = clamp(0.60 - (lv - 1) * 0.015, 0.35, 0.60);
            ctx.damage = Math.max(0, Math.floor((ctx.damage || 0) * ratio));
            ctx.logLines?.push(addBattleLogLine(`👁️ 飾品：遲滯凝視（敵傷害-${Math.round((1 - ratio) * 100)}%）`));
        }
    },
    // 14) 祝福回魔：每次勝利回復 6 MP
    victory_mana: {
        id: "victory_mana",
        name: "勝利回魔",
        desc: "勝利後回復 6 MP。",
        getDesc(lv) {
            const mp = scaleValue(6, lv, 0.15);
            return `勝利後回復 ${mp} MP。`;
        },
        victory(ctx, meta) {
            const lv = meta?.lv || 1;
            const mp = scaleValue(6, lv, 0.15);
            const c = ctx.char;
            c.mp = Math.min(ctx.total.mpMax, (c.mp || 0) + mp);
            ctx.logLines?.push(addBattleLogLine(`💙 飾品：勝利回魔 +${mp}`));
        }
    },
    // 15) 破盾增傷：若自身有護盾，本次攻擊傷害 +20%
    shield_fury: {
        id: "shield_fury",
        name: "護盾之怒",
        desc: "當你仍有護盾時，你的攻擊傷害 +20%。",
        getDesc(lv) {
            const mult = clamp(1.20 + (lv - 1) * 0.03, 1.20, 1.65);
            return `當你仍有護盾時，你的攻擊傷害 +${Math.round((mult - 1) * 100)}%。`;
        },
        beforePlayerAttack(ctx, meta) {
            const lv = meta?.lv || 1;
            if ((ctx.char.__shield || 0) <= 0) return;
            const mult = clamp(1.20 + (lv - 1) * 0.03, 1.20, 1.65);
            ctx.damage = Math.floor((ctx.damage || 0) * mult);
        }
    },
    // 16) 保底：採集時若抽到較低階素材，有 10% 直接改為該區域列表最後一個（通常較稀有）
    gather_upgrade: {
        id: "gather_upgrade",
        name: "祕密羅盤",
        desc: "採集時 10% 直接取得該區域採集列表的『最稀有項』。",
        getDesc(lv) {
            const p = scaleChance(0.10, lv, 0.015, 0.45);
            return `採集時 ${fmtPct(p)} 直接取得該區域採集列表的『最稀有項』。`;
        },
        gather(ctx, meta) {
            const lv = meta?.lv || 1;
            const p = scaleChance(0.10, lv, 0.015, 0.45);
            if (!chance(p)) return;
            const list = AREAS?.[ctx.area]?.gather || [];
            if (list.length === 0) return;
            ctx.mat = list[list.length - 1];
            ctx.toastSuffix = (ctx.toastSuffix || "") + "（羅盤指引）";
        }
    }
};

function getSlotGroup(type) {
    if (!type) return "";
    // 支援 type="accessory"（背包中）與 type="accessory1~5"（已穿戴欄位）
    if (String(type) === "accessory") return "accessory";
    if (String(type).startsWith("accessory")) return "accessory";
    return type;
}

function getSetName(setId) {
    if (!setId) return "無套裝";
    return SETS?.[setId]?.name || setId;
}

function createSetOptionsHtml(includeNone = true) {
    const ids = Object.keys(SETS || {});
    ids.sort((a, b) => getSetName(a).localeCompare(getSetName(b), "zh-Hant"));
    let html = `<option value="all">全部</option>`;
    if (includeNone) html += `<option value="none">無套裝</option>`;
    for (const id of ids) {
        html += `<option value="${id}">${getSetName(id)}</option>`;
    }
    return html;
}

function createNumberOptionsHtml(numbers, { includeAll = true, allLabel = "全部" } = {}) {
    const list = Array.from(new Set(numbers.map(n => Number(n)).filter(n => !Number.isNaN(n)))).sort((a, b) => a - b);
    let html = includeAll ? `<option value="all">${allLabel}</option>` : "";
    for (const n of list) {
        html += `<option value="${n}">Lv.${n}</option>`;
    }
    return html;
}

function initFilterUIIfNeeded() {
    // Forge
    const forgeSet = document.getElementById("forge-filter-set");
    const forgeLv = document.getElementById("forge-filter-level");
    const forgeSlot = document.getElementById("forge-filter-slot");
    const forgeCraftable = document.getElementById("forge-filter-craftable");

    if (forgeSet && !forgeSet.dataset._inited) {
        forgeSet.innerHTML = createSetOptionsHtml(true);
        forgeSet.value = uiState.forgeFilter.setId;
        forgeSet.addEventListener("change", () => {
            uiState.forgeFilter.setId = forgeSet.value;
            renderForge();
        });
        forgeSet.dataset._inited = "1";
    }

    if (forgeLv && !forgeLv.dataset._inited) {
        const allLevels = Object.values(FORGE_RECIPES || {}).map(r => r?.level).filter(Boolean);
        forgeLv.innerHTML = createNumberOptionsHtml(allLevels, { includeAll: true, allLabel: "全部" });
        forgeLv.value = uiState.forgeFilter.level;
        forgeLv.addEventListener("change", () => {
            uiState.forgeFilter.level = forgeLv.value;
            renderForge();
        });
        forgeLv.dataset._inited = "1";
    }

    if (forgeSlot && !forgeSlot.dataset._inited) {
        forgeSlot.value = uiState.forgeFilter.slot;
        forgeSlot.addEventListener("change", () => {
            uiState.forgeFilter.slot = forgeSlot.value;
            renderForge();
        });
        forgeSlot.dataset._inited = "1";
    }

    if (forgeCraftable && !forgeCraftable.dataset._inited) {
        forgeCraftable.checked = !!uiState.forgeFilter.craftableOnly;
        forgeCraftable.addEventListener("change", () => {
            uiState.forgeFilter.craftableOnly = !!forgeCraftable.checked;
            renderForge();
        });
        forgeCraftable.dataset._inited = "1";
    }

    // Bag equipment filter
    const bagSet = document.getElementById("bag-filter-set");
    const bagLv = document.getElementById("bag-filter-level");
    const bagSlot = document.getElementById("bag-filter-slot");

    if (bagSet && !bagSet.dataset._inited) {
        bagSet.innerHTML = createSetOptionsHtml(true);
        bagSet.value = uiState.bagEquipFilter.setId;
        bagSet.addEventListener("change", () => {
            uiState.bagEquipFilter.setId = bagSet.value;
            renderBag();
        });
        bagSet.dataset._inited = "1";
    }

    if (bagLv && !bagLv.dataset._inited) {
        const levels = (gameData?.bag?.equipments || []).map(it => it?.level).filter(Boolean);
        bagLv.innerHTML = createNumberOptionsHtml(levels, { includeAll: true, allLabel: "全部" });
        bagLv.value = uiState.bagEquipFilter.level;
        bagLv.addEventListener("change", () => {
            uiState.bagEquipFilter.level = bagLv.value;
            renderBag();
        });
        bagLv.dataset._inited = "1";
    }

    if (bagSlot && !bagSlot.dataset._inited) {
        bagSlot.value = uiState.bagEquipFilter.slot;
        bagSlot.addEventListener("change", () => {
            uiState.bagEquipFilter.slot = bagSlot.value;
            renderBag();
        });
        bagSlot.dataset._inited = "1";
    }
}

function isForgeRecipeCraftable(recipe) {
    if (!recipe?.materials) return false;
    for (const mat in recipe.materials) {
        const need = recipe.materials[mat];
        const have = gameData?.bag?.materials?.[mat] || 0;
        if (have < need) return false;
    }
    return true;
}

// ========================== 全局常量：全量完善数据（含图标与描述） ==========================
/** 素材库（40种，全覆盖） */
const MATERIALS = {
    // 皮革类
    rough_leather:   { name: "粗皮革",   icon: "🟤", desc: "普通的动物皮革，可用于制作基础防具。" },
    wolf_leather:    { name: "狼皮革",   icon: "🐺", desc: "灰狼的坚韧毛皮，具有不错的御寒效果。" },
    bear_leather:    { name: "熊皮革",   icon: "🐻", desc: "厚实的熊皮，能有效抵御物理攻击。" },
    snake_skin:      { name: "蛇皮",     icon: "🐍", desc: "沙漠蛇蜕下的光滑皮，轻薄且柔韧。" },
    lizard_scales:   { name: "蜥蜴鳞",   icon: "🦎", desc: "坚硬的蜥蜴鳞片，可用来强化装备。" },
    tiger_fur:       { name: "虎皮",     icon: "🐯", desc: "珍稀的猛虎毛皮，象征力量与威严。" },
    dragon_hide:     { name: "龙皮",     icon: "🐉", desc: "传说中的龙皮，极其稀有且防御力惊人。" },
    shadow_leather:  { name: "暗影皮革", icon: "🌑", desc: "来自暗影生物的漆黑皮革，蕴含黑暗力量。" },
    // 矿石类
    copper_ore:      { name: "铜矿",     icon: "🟠", desc: "最基础的金属矿石，适合制作新手装备。" },
    iron_ore:        { name: "铁矿",     icon: "⚙️", desc: "坚硬的铁矿石，锻造中级装备的必备材料。" },
    silver_ore:      { name: "银矿",     icon: "⚪", desc: "散发微光的银矿石，具有一定的魔法亲和力。" },
    gold_ore:        { name: "金矿",     icon: "🟡", desc: "闪耀的金色矿石，价值不菲的稀有材料。" },
    steel_ingot:     { name: "钢锭",     icon: "🔩", desc: "经过精炼的钢锭，坚固耐用，高级装备的核心材料。" },
    mithril_ore:     { name: "秘银矿",   icon: "💠", desc: "轻盈而坚固的秘银，精灵们最爱的魔法金属。" },
    adamantite:      { name: "精金",     icon: "💎", desc: "世界上最坚硬的金属，传说由陨石带来。" },
    crystal:         { name: "魔法水晶", icon: "🔮", desc: "蕴含魔力的水晶，可增幅装备的魔法属性。" },
    shadow_ore:      { name: "暗影矿",   icon: "🖤", desc: "来自地底深渊的暗影矿石，散发不祥的气息。" },
    fire_crystal:    { name: "火焰水晶", icon: "🔥", desc: "熔岩中凝结的火晶，触碰时能感受到灼热。" },
    // 木材类
    wood:            { name: "木头",     icon: "🪵", desc: "普通的木材，适合制作简易工具和武器。" },
    hard_wood:       { name: "硬木",     icon: "🪓", desc: "质地坚硬的木材，可打造更耐用的装备。" },
    ancient_wood:    { name: "古木",     icon: "🏛️", desc: "千年古树的木材，蕴含自然之力的稀有材料。" },
    elf_wood:        { name: "精灵木",   icon: "🧝", desc: "精灵森林特有的魔法木材，轻盈且富有灵力。" },
    fire_wood:       { name: "火焰木",   icon: "🔥", desc: "生长在火山地带的耐火奇木，永不燃烧。" },
    shadow_wood:     { name: "暗影木",   icon: "🌑", desc: "被暗影侵蚀的树木，漆黑如墨且异常坚固。" },
    // 草药类
    herb:            { name: "药草",     icon: "🌿", desc: "常见的疗伤草药，可恢复少量体力。" },
    red_herb:        { name: "红药草",   icon: "🌹", desc: "红色药草，具有更强的疗伤功效。" },
    blue_herb:       { name: "蓝药草",   icon: "💙", desc: "蓝色药草，能补充魔力，法师的最爱。" },
    golden_herb:     { name: "金药草",   icon: "🌟", desc: "稀有的金色药草，可大幅恢复体力与魔力。" },
    magic_herb:      { name: "魔法草",   icon: "✨", desc: "充满魔力的奇异草药，炼金术士梦寐以求。" },
    poison_herb:     { name: "毒草",     icon: "☠️", desc: "有毒的草药，虽然危险但可制作特殊药剂。" },
    life_herb:       { name: "生命草",   icon: "❤️", desc: "传说能起死回生的神奇草药，极其珍贵。" },
    mana_herb:       { name: "魔力草",   icon: "💜", desc: "专为法师培育的魔力草药，大幅补充魔力。" },
    // 怪物掉落
    slime_jelly:     { name: "史莱姆凝胶", icon: "🟢", desc: "史莱姆身体的核心物质，黏糊糊的。" },
    tooth:           { name: "尖牙",     icon: "🦷", desc: "野兽的锋利尖牙，可用来制作武器配件。" },
    claw:            { name: "利爪",     icon: "🦅", desc: "猛兽的锐利爪子，加工后可镶嵌于武器上。" },
    feather:         { name: "羽毛",     icon: "🪶", desc: "轻盈的羽毛，可用于制作饰品和箭矢。" },
    venom:           { name: "毒液",     icon: "🧪", desc: "剧毒生物的毒液，涂在武器上可附加毒性。" },
    horn:            { name: "牛角",     icon: "📯", desc: "粗壮的牛角，可打造为号角或装饰品。" },
    dragon_scale:    { name: "龙鳞",     icon: "🐉", desc: "巨龙的鳞片，世间最顶级的锻造材料之一。" },
    shadow_core:     { name: "暗影核心", icon: "💀", desc: "暗影生物的能量核心，散发诡异的暗光。" }
    ,swamp_moss:     { name: "沼泽苔", icon: "🟩", desc: "潮湿沼泽中生长的苔藓，可用于炼金与制作抗毒装备。" }
    ,bog_ichor:      { name: "沼泽脓液", icon: "🫧", desc: "腐化生物的体液，带有强烈毒性。" }
    ,obsidian:       { name: "黑曜石", icon: "🧊", desc: "火山喷发后冷却形成的黑曜石，锋利且耐热。" }
    ,basalt:         { name: "玄武岩", icon: "⬛", desc: "火山地带常见的坚硬岩石，可作为锻造基底。" }
    ,ancient_relic:  { name: "古代遗物", icon: "🏺", desc: "遗迹中发现的古代器物碎片，可交换或用于高级锻造。" }
    ,holy_dust:      { name: "圣洁粉尘", icon: "✨", desc: "被祝福的粉尘，可用于制作抗暗影与恢复类饰品。" }
    ,abyss_essence:  { name: "深渊精华", icon: "🕳️", desc: "深渊怪物的本源能量，极其稀有，是顶级套装核心材料。" }
    ,storm_shard:    { name: "风暴碎片", icon: "🌩️", desc: "雷暴中凝结的碎片，蕴含狂暴电能。" }
};

/** 装备库（严格匹配11个装备插槽，左右手完全独立） */
const EQUIPMENTS = {
    // 右手武器（主手）
    wooden_sword: { name: "木剑", type: "rightHand", str: 2, def: 1, hp: 0, mp: 0, icon: "⚔️", desc: "用普通木材削成的练习剑，冒险者的第一把武器。" },
    iron_sword:   { name: "铁剑", type: "rightHand", str: 5, def: 2, hp: 0, mp: 0, icon: "⚔️", desc: "铁匠铺打造的标准铁剑，锋利且耐用。" },
    steel_sword:  { name: "钢剑", type: "rightHand", str: 8, def: 4, hp: 5, mp: 0, icon: "⚔️", desc: "钢锭锻造的精良长剑，削铁如泥，无人能挡。" },
    mithril_sword:{ name: "秘银剑", type: "rightHand", str: 12, def: 6, hp: 10, mp: 5, icon: "🗡️", desc: "秘银打造的轻盈长剑，兼具锋利与魔力传导。" },
    flame_blade:  { name: "炎刃", type: "rightHand", str: 14, def: 5, hp: 0, mp: 8, icon: "🔥", desc: "镶嵌火焰水晶的剑刃，挥舞时带着灼热气流。" },
    shadow_dagger:{ name: "暗影匕首", type: "rightHand", str: 10, def: 2, hp: 0, mp: 12, icon: "🌑", desc: "暗影矿淬炼的匕首，适合敏捷的刺杀者。" },
    // 左手盾牌/副手（完全独立）
    wooden_shield: { name: "木盾", type: "leftHand", str: 0, def: 3, hp: 8, mp: 0, icon: "🛡️", desc: "木制圆盾，轻便但能为冒险者提供基础防护。" },
    iron_shield:   { name: "铁盾", type: "leftHand", str: 0, def: 6, hp: 15, mp: 0, icon: "🛡️", desc: "铁质塔盾，厚重的防御力足以抵挡强力攻击。" },
    steel_shield:  { name: "钢盾", type: "leftHand", str: 0, def: 9, hp: 25, mp: 0, icon: "🛡️", desc: "精钢铸造的守护之盾，战场上坚不可摧的壁垒。" },
    mithril_shield:{ name: "秘银盾", type: "leftHand", str: 0, def: 13, hp: 35, mp: 6, icon: "💠", desc: "秘银铸造的盾牌，防御强大且能稳定魔力流动。" },
    mirror_buckler:{ name: "镜面圆盾", type: "leftHand", str: 0, def: 10, hp: 20, mp: 12, icon: "🪞", desc: "抛光银矿制成的圆盾，对魔法有良好亲和性。" },
    // 帽子
    cloth_hat:   { name: "布帽", type: "hat", str: 0, def: 1, hp: 5, mp: 3, icon: "🧢", desc: "简单的布制帽子，遮阳挡雨的基本装备。" },
    leather_hat: { name: "皮帽", type: "hat", str: 1, def: 2, hp: 8, mp: 5, icon: "🎩", desc: "皮革缝制的帽子，比布帽更结实耐用。" },
    iron_hat:    { name: "铁盔", type: "hat", str: 2, def: 4, hp: 12, mp: 0, icon: "⛑️", desc: "铁制头盔，能有效保护头部免受致命伤害。" },
    mage_hood:   { name: "法师兜帽", type: "hat", str: 0, def: 2, hp: 8, mp: 18, icon: "🧙", desc: "织入水晶粉末的兜帽，提高魔力上限。" },
    // 衣服
    copper_armor: { name: "铜甲", type: "chest", str: 1, def: 4, hp: 10, mp: 0, icon: "🦺", desc: "铜片编织的护甲，新手冒险者的可靠防护。" },
    iron_armor:   { name: "铁甲", type: "chest", str: 2, def: 8, hp: 20, mp: 0, icon: "🦺", desc: "铁制全身甲，重量不轻但防御力极佳。" },
    shadow_armor: { name: "暗影甲", type: "chest", str: 5, def: 12, hp: 30, mp: 10, icon: "🦺", desc: "暗影之力灌注的神秘铠甲，穿上后仿佛与黑夜融为一体。" },
    steel_armor:  { name: "钢甲", type: "chest", str: 3, def: 10, hp: 25, mp: 0, icon: "🦺", desc: "以钢锭打造的铠甲，防护更上一层楼。" },
    mithril_armor:{ name: "秘银铠", type: "chest", str: 4, def: 14, hp: 35, mp: 10, icon: "💠", desc: "秘银与古木纤维交织的轻甲，兼具防御与机动。" },
    // 护腿
    cloth_pants:   { name: "布裤", type: "pants", str: 0, def: 1, hp: 4, mp: 2, icon: "👖", desc: "普通的布制长裤，轻便舒适但没什么防护力。" },
    leather_pants: { name: "皮裤", type: "pants", str: 0, def: 2, hp: 8, mp: 4, icon: "👖", desc: "皮革制成的裤子，在灵活性与防护间取得平衡。" },
    iron_pants:    { name: "铁腿甲", type: "pants", str: 1, def: 5, hp: 15, mp: 0, icon: "👖", desc: "铁质腿甲，虽然沉重但能保护双腿免受重创。" },
    steel_pants:   { name: "钢腿甲", type: "pants", str: 1, def: 7, hp: 18, mp: 0, icon: "👖", desc: "钢制腿甲，稳定步伐并提升耐打能力。" },
    // 鞋子
    cloth_shoes:   { name: "布鞋", type: "shoes", str: 0, def: 1, hp: 3, mp: 2, icon: "👟", desc: "轻便的布鞋，适合长途跋涉但防护不足。" },
    leather_shoes: { name: "皮鞋", type: "shoes", str: 1, def: 2, hp: 6, mp: 3, icon: "👢", desc: "坚固的皮鞋，行走荒野时的可靠伙伴。" },
    iron_shoes:    { name: "铁靴", type: "shoes", str: 2, def: 3, hp: 10, mp: 0, icon: "👢", desc: "铁制战靴，踏破荆棘如履平地，霸气十足。" },
    steel_boots:   { name: "钢靴", type: "shoes", str: 2, def: 5, hp: 14, mp: 0, icon: "🥾", desc: "更坚固的钢靴，适合矿山与战场的恶劣环境。" },
    // 饰品（建議 type="accessory"；穿戴時會自動塞到 accessory1~5 空位；舊飾品仍相容）
    power_ring:    { name: "力量戒指", type: "accessory", str: 3, def: 0, hp: 0, mp: 0, icon: "💍", desc: "镶嵌红宝石的力量戒指，佩戴者力大无穷。" },
    def_ring:      { name: "防御戒指", type: "accessory", str: 0, def: 3, hp: 0, mp: 0, icon: "💍", desc: "刻有防护符文的戒指，形成无形的防御屏障。" },
    hp_necklace:   { name: "生命项链", type: "accessory", str: 0, def: 1, hp: 20, mp: 0, icon: "📿", desc: "蕴含生命精华的项链，佩戴者体力源源不绝。" },
    mp_necklace:   { name: "魔力项链", type: "accessory", str: 0, def: 0, hp: 0, mp: 15, icon: "📿", desc: "储存魔力的水晶项链，法师的必备饰品。" },
    shadow_amulet: { name: "暗影护身符", type: "accessory", str: 2, def: 2, hp: 10, mp: 10, icon: "✨", desc: "暗影神力加持的护身符，全属性均衡提升。" }

    // ====================== 新增：可鍛造飾品（至少15種；含特殊效果） ======================
    ,ward_charm:     { name: "守護符印", type: "accessory", str: 0, def: 1, hp: 0, mp: 0, icon: "🛡️", desc: "刻印守護符文的吊飾，戰鬥開始形成護盾。", effectIds: ["ward_start_shield"] }
    ,thorn_brooch:   { name: "荊棘胸針", type: "accessory", str: 0, def: 1, hp: 0, mp: 0, icon: "🌵", desc: "帶刺的胸針，受擊時偶爾觸發反擊。", effectIds: ["thorn_counter"] }
    ,execution_ring: { name: "處決戒", type: "accessory", str: 1, def: 0, hp: 0, mp: 0, icon: "⚔️", desc: "敵人瀕死時更容易一擊斬殺。", effectIds: ["execute_lowhp"] }
    ,pierce_talisman:{ name: "穿甲護符", type: "accessory", str: 0, def: 0, hp: 0, mp: 0, icon: "🪓", desc: "讓攻擊有機會直穿護甲。", effectIds: ["pierce_armor"] }
    ,vampire_tooth:  { name: "血牙墜飾", type: "accessory", str: 0, def: 0, hp: 0, mp: 0, icon: "🩸", desc: "造成傷害時汲取少量生命。", effectIds: ["vampiric"] }
    ,combo_band:     { name: "連擊腕環", type: "accessory", str: 0, def: 0, hp: 0, mp: 0, icon: "⚡", desc: "攻擊後偶爾追加追擊。", effectIds: ["double_strike"] }
    ,blessing_bead:  { name: "祝福念珠", type: "accessory", str: 0, def: 0, hp: 0, mp: 0, icon: "✨", desc: "勝利後偶爾獲得額外水晶。", effectIds: ["blessing_extra_drop"] }
    ,lucky_coin:     { name: "幸運硬幣", type: "accessory", str: 0, def: 0, hp: 0, mp: 0, icon: "🪙", desc: "採集時偶爾多拿一份素材。", effectIds: ["gather_lucky"] }
    ,herbal_mortar:  { name: "草藥研缽", type: "accessory", str: 0, def: 0, hp: 0, mp: 0, icon: "🌿", desc: "採到藥草時偶爾提純為紅藥草。", effectIds: ["gather_refine_herb"] }
    ,firststrike_pin:{ name: "先鋒別針", type: "accessory", str: 0, def: 0, hp: 0, mp: 0, icon: "💥", desc: "地下城戰鬥開始時偶爾先手打擊。", effectIds: ["dungeon_first_blood"] }
    ,unyielding_sig:{ name: "不屈印記", type: "accessory", str: 0, def: 0, hp: 0, mp: 0, icon: "🪽", desc: "每場戰鬥一次，致命傷害時保留 1HP。", effectIds: ["cheat_death_once"] }
    ,storm_seal:     { name: "風暴封印", type: "accessory", str: 0, def: 0, hp: 0, mp: 0, icon: "🌩️", desc: "每數次攻擊後，下一擊追加雷擊傷害。", effectIds: ["storm_charge"] }
    ,gorgon_eye:     { name: "石化凝視之眼", type: "accessory", str: 0, def: 0, hp: 0, mp: 0, icon: "👁️", desc: "敵人出手前偶爾被遲滯，傷害降低。", effectIds: ["weaken_enemy"] }
    ,victory_chime:  { name: "凱旋風鈴", type: "accessory", str: 0, def: 0, hp: 0, mp: 0, icon: "💙", desc: "勝利後回復少量 MP。", effectIds: ["victory_mana"] }
    ,shield_fury_gem:{ name: "護盾之怒晶", type: "accessory", str: 0, def: 0, hp: 0, mp: 0, icon: "🔷", desc: "當你仍有護盾時，攻擊更兇猛。", effectIds: ["shield_fury"] }
    ,secret_compass: { name: "祕密羅盤", type: "accessory", str: 0, def: 0, hp: 0, mp: 0, icon: "🧭", desc: "採集時偶爾直接指引到該區域最稀有素材。", effectIds: ["gather_upgrade"] }

    // ====================== 新增：可锻造套装装备（至少8套） ======================
    // 1) 新手「旅人」套装（4件：帽/衣/裤/鞋）
    ,traveler_cap:   { name: "旅人帽", type: "hat",   str: 0, def: 2, hp: 8,  mp: 0, icon: "🧢", desc: "轻便耐用的旅人帽，适合长途跋涉。", setId: "traveler" }
    ,traveler_coat:  { name: "旅人外套", type: "chest", str: 1, def: 4, hp: 12, mp: 0, icon: "🧥", desc: "保暖的外套，能在野外抵御轻微伤害。", setId: "traveler" }
    ,traveler_pants: { name: "旅人长裤", type: "pants", str: 0, def: 2, hp: 10, mp: 0, icon: "👖", desc: "行动方便的长裤，适合探索。", setId: "traveler" }
    ,traveler_boots: { name: "旅人靴", type: "shoes", str: 0, def: 2, hp: 8,  mp: 0, icon: "🥾", desc: "耐磨的皮靴，能保护脚踝。", setId: "traveler" }

    // 2) 「守卫」套装（4件：帽/衣/裤/鞋）
    ,guard_helm:  { name: "守卫头盔", type: "hat",   str: 1, def: 5, hp: 10, mp: 0, icon: "⛑️", desc: "城镇守卫常用的铁盔。", setId: "guard" }
    ,guard_armor: { name: "守卫铠甲", type: "chest", str: 2, def: 10, hp: 18, mp: 0, icon: "🦺", desc: "厚重可靠，面对猛兽也不退缩。", setId: "guard" }
    ,guard_greaves:{ name: "守卫腿甲", type: "pants", str: 1, def: 6, hp: 14, mp: 0, icon: "👖", desc: "强化过的护腿，能稳住步伐。", setId: "guard" }
    ,guard_sabatons:{ name: "守卫战靴", type: "shoes", str: 1, def: 5, hp: 12, mp: 0, icon: "👢", desc: "踏实的战靴，适合正面冲突。", setId: "guard" }

    // 3) 「游侠」套装（4件：帽/衣/裤/鞋）
    ,ranger_hood:   { name: "游侠兜帽", type: "hat",   str: 1, def: 3, hp: 8,  mp: 0, icon: "🧢", desc: "便于潜行与观察的兜帽。", setId: "ranger" }
    ,ranger_vest:   { name: "游侠背心", type: "chest", str: 2, def: 6, hp: 10, mp: 0, icon: "🦺", desc: "轻甲结构，适合灵活战斗。", setId: "ranger" }
    ,ranger_pants:  { name: "游侠护腿", type: "pants", str: 1, def: 4, hp: 10, mp: 0, icon: "👖", desc: "行动更迅捷，减少负重感。", setId: "ranger" }
    ,ranger_boots:  { name: "游侠靴", type: "shoes", str: 1, def: 3, hp: 8,  mp: 0, icon: "👟", desc: "轻便的靴子，适合追猎。", setId: "ranger" }

    // 4) 「法师」套装（4件：帽/衣/裤/鞋）
    ,mage_hat:    { name: "法师尖帽", type: "hat",   str: 0, def: 2, hp: 6,  mp: 22, icon: "🧙", desc: "注入水晶粉的尖帽，提升魔力。", setId: "mage" }
    ,mage_robe:   { name: "法师长袍", type: "chest", str: 0, def: 4, hp: 10, mp: 30, icon: "🧥", desc: "布料中缝入法纹，利于施法。", setId: "mage" }
    ,mage_pants:  { name: "法师束裤", type: "pants", str: 0, def: 3, hp: 8,  mp: 20, icon: "👖", desc: "轻便且保暖，减少走位阻碍。", setId: "mage" }
    ,mage_shoes:  { name: "法师软鞋", type: "shoes", str: 0, def: 2, hp: 6,  mp: 18, icon: "👟", desc: "柔软安静的鞋子，适合专注施法。", setId: "mage" }

    // 5) 「暗影」套装（4件）
    ,shadow_mask:  { name: "暗影面罩", type: "hat",   str: 3, def: 3, hp: 10, mp: 10, icon: "🌑", desc: "遮蔽气息的面罩，适合刺杀。", setId: "shadow" }
    ,shadow_mail:  { name: "暗影轻甲", type: "chest", str: 5, def: 10, hp: 22, mp: 12, icon: "🦺", desc: "以暗影皮革缝制的轻甲，悄无声息。", setId: "shadow" }
    ,shadow_legs:  { name: "暗影护腿", type: "pants", str: 4, def: 7,  hp: 18, mp: 10, icon: "👖", desc: "行动更快，适合短兵相接。", setId: "shadow" }
    ,shadow_steps: { name: "暗影短靴", type: "shoes", str: 3, def: 6,  hp: 16, mp: 10, icon: "🥾", desc: "踏地无声的短靴。", setId: "shadow" }

    // 6) 「火山」套装（4件）
    ,volcanic_helm: { name: "火山头盔", type: "hat",   str: 3, def: 6,  hp: 14, mp: 0, icon: "🔥", desc: "耐热金属打造，能抵御灼烧。", setId: "volcanic" }
    ,volcanic_armor:{ name: "火山铠甲", type: "chest", str: 5, def: 14, hp: 26, mp: 0, icon: "🔥", desc: "黑曜石与钢锭复合锻造，坚不可摧。", setId: "volcanic" }
    ,volcanic_legs: { name: "火山腿甲", type: "pants", str: 4, def: 10, hp: 22, mp: 0, icon: "👖", desc: "沉稳厚实，抗打击。", setId: "volcanic" }
    ,volcanic_boots:{ name: "火山战靴", type: "shoes", str: 4, def: 9,  hp: 20, mp: 0, icon: "🥾", desc: "踏在熔岩边缘也不惧。", setId: "volcanic" }

    // 7) 「圣光」套装（4件）
    ,holy_circlet: { name: "圣光头冠", type: "hat",   str: 0, def: 5,  hp: 16, mp: 16, icon: "✨", desc: "散发柔和光辉的头冠。", setId: "holy" }
    ,holy_mail:    { name: "圣光胸甲", type: "chest", str: 2, def: 14, hp: 30, mp: 12, icon: "✨", desc: "被祝福的铠甲，能驱散阴影。", setId: "holy" }
    ,holy_legs:    { name: "圣光护腿", type: "pants", str: 1, def: 10, hp: 26, mp: 10, icon: "👖", desc: "守护行者的步伐。", setId: "holy" }
    ,holy_boots:   { name: "圣光靴", type: "shoes", str: 1, def: 9,  hp: 22, mp: 10, icon: "👢", desc: "踏过黑暗仍能前行。", setId: "holy" }

    // 8) 「深渊」套装（4件）
    ,abyss_helm:  { name: "深渊头盔", type: "hat",   str: 6, def: 8,  hp: 18, mp: 8,  icon: "🕳️", desc: "深渊金属打造，散发低语。", setId: "abyss" }
    ,abyss_armor: { name: "深渊铠甲", type: "chest", str: 10, def: 18, hp: 40, mp: 14, icon: "🕳️", desc: "越是黑暗，越能提供保护。", setId: "abyss" }
    ,abyss_legs:  { name: "深渊护腿", type: "pants", str: 8, def: 14, hp: 34, mp: 12, icon: "👖", desc: "在绝境中仍能稳固站立。", setId: "abyss" }
    ,abyss_boots: { name: "深渊战靴", type: "shoes", str: 8, def: 12, hp: 30, mp: 12, icon: "🥾", desc: "每一步都像踩在虚无之上。", setId: "abyss" }
};

/** 套装定义：至少8套（2/4件效果） */
const SETS = {
    traveler: {
        name: "旅人套装",
        bonuses: {
            2: { hpMax: 20, def: 2, desc: "(2) ❤️生命上限+20、🛡️防御+2" },
            4: { str: 2, hpMax: 30, desc: "(4) ⚔️力量+2、❤️生命上限+30" }
        }
    },
    guard: {
        name: "守卫套装",
        bonuses: {
            2: { def: 6, hpMax: 20, desc: "(2) 🛡️防御+6、❤️生命上限+20" },
            4: { def: 10, str: 3, desc: "(4) 🛡️防御+10、⚔️力量+3" }
        }
    },
    ranger: {
        name: "游侠套装",
        bonuses: {
            2: { str: 3, desc: "(2) ⚔️力量+3" },
            4: { str: 5, def: 3, desc: "(4) ⚔️力量+5、🛡️防御+3" }
        }
    },
    mage: {
        name: "法师套装",
        bonuses: {
            2: { mpMax: 40, def: 2, desc: "(2) 💙魔力上限+40、🛡️防御+2" },
            4: { mpMax: 60, str: 2, desc: "(4) 💙魔力上限+60、⚔️力量+2" }
        }
    },
    shadow: {
        name: "暗影套装",
        bonuses: {
            2: { str: 4, mpMax: 20, desc: "(2) ⚔️力量+4、💙魔力上限+20" },
            4: { str: 7, def: 5, desc: "(4) ⚔️力量+7、🛡️防御+5" }
        }
    },
    volcanic: {
        name: "火山套装",
        bonuses: {
            2: { def: 8, str: 3, desc: "(2) 🛡️防御+8、⚔️力量+3" },
            4: { def: 14, str: 6, hpMax: 30, desc: "(4) 🛡️防御+14、⚔️力量+6、❤️生命上限+30" }
        }
    },
    holy: {
        name: "圣光套装",
        bonuses: {
            2: { hpMax: 30, mpMax: 20, desc: "(2) ❤️生命上限+30、💙魔力上限+20" },
            4: { def: 12, hpMax: 40, mpMax: 30, desc: "(4) 🛡️防御+12、❤️生命上限+40、💙魔力上限+30" }
        }
    },
    abyss: {
        name: "深渊套装",
        bonuses: {
            2: { str: 8, def: 6, desc: "(2) ⚔️力量+8、🛡️防御+6" },
            4: { str: 14, def: 12, hpMax: 50, mpMax: 30, desc: "(4) ⚔️力量+14、🛡️防御+12、❤️生命上限+50、💙魔力上限+30" }
        }
    }
};

/** 食物库（20种，全可使用） */
const FOODS = {
    apple:          { name: "苹果",   hp: 10, mp: 0,  buff: "", icon: "🍎", desc: "新鲜采摘的红苹果，清甜可口，恢复少量体力。" },
    bread:          { name: "面包",   hp: 20, mp: 5,  buff: "", icon: "🍞", desc: "烤得金黄的小麦面包，冒险途中的主食。" },
    meat:           { name: "烤肉",   hp: 40, mp: 10, buff: "", icon: "🥩", desc: "火烤得恰到好处的野兽肉，香味四溢。" },
    herb_tea:       { name: "药草茶", hp: 0,  mp: 20, buff: "", icon: "🍵", desc: "用药草冲泡的热茶，能舒缓精神、恢复魔力。" },
    steak:          { name: "牛排",   hp: 60, mp: 15, buff: "", icon: "🥩", desc: "顶级牛排，肉质鲜嫩多汁，战斗后的最佳犒赏。" },
    berry:          { name: "野莓",   hp: 15, mp: 3,  buff: "", icon: "🫐", desc: "路边采到的野莓，酸甜爽口的小零嘴。" },
    mushroom_soup:  { name: "蘑菇汤", hp: 30, mp: 8,  buff: "", icon: "🍄", desc: "用森林蘑菇熬煮的浓汤，暖胃又滋补。" },
    honey_water:    { name: "蜂蜜水", hp: 25, mp: 12, buff: "", icon: "🍯", desc: "蜂蜜调和的水，甜美解渴并能恢复魔力。" },
    grilled_fish:   { name: "烤鱼",   hp: 50, mp: 12, buff: "", icon: "🐟", desc: "现烤的河鱼，外焦里嫩，鲜美无比。" },
    life_potion:    { name: "生命药剂", hp: 100, mp: 0,  buff: "", icon: "❤️", desc: "炼金术士制作的红色药剂，可瞬间治愈重伤。" },
    mana_potion:    { name: "魔力药剂", hp: 0,   mp: 50, buff: "", icon: "💙", desc: "炼金术士制作的蓝色药剂，魔力枯竭时的救星。" }
    ,stamina_jerky: { name: "耐力肉干", hp: 35, mp: 0,  buff: "", icon: "🥓", desc: "风干的肉干，耐放又顶饿，恢复中量体力。" }
    ,elixir:        { name: "灵药",     hp: 60, mp: 60, buff: "", icon: "🧪", desc: "稀有灵药，同时恢复体力与魔力。" }
    ,antidote:      { name: "解毒剂",   hp: 0,  mp: 10, buff: "", icon: "💊", desc: "用于中和毒素的药剂，目前先作为小额回蓝道具。" }
};

/** 怪物库（分区域，60+配置，无undefined） */
const MONSTERS = {
    grassland: [
        { name: "小史莱姆", hp: 30, hpMax: 30, str: 3, def: 1, exp: 10, icon: "🟢", desc: "草原上最常见的弱小魔物，初学者练手的好选择。", drop: { slime_jelly: 1, wood: 1 } },
        { name: "草原兔",   hp: 25, hpMax: 25, str: 2, def: 1, exp: 8,  icon: "🐰", desc: "看似可爱实则凶猛的大兔子，小心它的踢击！", drop: { rough_leather: 1, herb: 1 } },
        { name: "野猪",     hp: 40, hpMax: 40, str: 5, def: 2, exp: 15, icon: "🐗", desc: "暴躁的野猪，獠牙能刺穿皮甲，务必谨慎应对。", drop: { tooth: 1, rough_leather: 2 } },
        { name: "野鹿",     hp: 35, hpMax: 35, str: 4, def: 2, exp: 12, icon: "🦌", desc: "优雅的野鹿，虽然温顺但角也十分致命。", drop: { horn: 1, herb: 2 } }
    ],
    forest: [
        { name: "灰狼",   hp: 50, hpMax: 50, str: 7, def: 3, exp: 20, icon: "🐺", desc: "幽暗森林中的群居猛兽，锋利的爪牙是它的武器。", drop: { wolf_leather: 2, claw: 1 } },
        { name: "树精",   hp: 60, hpMax: 60, str: 4, def: 5, exp: 25, icon: "🌳", desc: "被魔力唤醒的古树，树皮坚硬如铁，不易对付。", drop: { hard_wood: 3, magic_herb: 1 } },
        { name: "毒蜂",   hp: 45, hpMax: 45, str: 6, def: 2, exp: 18, icon: "🐝", desc: "巨型毒蜂，尾针的毒素能让冒险者麻痹。", drop: { feather: 1, poison_herb: 1 } },
        { name: "黑熊",   hp: 70, hpMax: 70, str: 9, def: 4, exp: 30, icon: "🐻", desc: "森林的霸主，一巴掌就能拍碎石头的可怕猛兽。", drop: { bear_leather: 2, claw: 2 } },
        { name: "蜥蜴人斥候", hp: 85, hpMax: 85, str: 11, def: 5, exp: 42, icon: "🦎", desc: "在林间游走的蜥蜴人，擅长偷袭与追踪。", drop: { lizard_scales: 2, claw: 1, hard_wood: 1 } }
    ],
    mine: [
        { name: "石头人",     hp: 80, hpMax: 80, str: 6, def: 8, exp: 30, icon: "🗿", desc: "由矿石构成的生命体，物理防御极高。", drop: { copper_ore: 3, iron_ore: 2 } },
        { name: "矿工幽灵",   hp: 70, hpMax: 70, str: 9, def: 4, exp: 35, icon: "👻", desc: "死在矿坑中的矿工怨灵，会发动无视防御的灵魂攻击。", drop: { crystal: 2, shadow_ore: 1 } },
        { name: "熔岩史莱姆", hp: 65, hpMax: 65, str: 8, def: 3, exp: 32, icon: "🔥", desc: "生活在岩浆附近的火焰史莱姆，触碰即被灼伤。", drop: { fire_crystal: 1, slime_jelly: 2 } },
        { name: "银矿工",     hp: 90, hpMax: 90, str: 7, def: 6, exp: 40, icon: "⛏️", desc: "被诅咒的矿工，挥舞着银镐守护矿脉。", drop: { silver_ore: 2, crystal: 1 } },
        { name: "矿坑魔像",   hp: 120, hpMax: 120, str: 10, def: 12, exp: 60, icon: "🧱", desc: "吸收矿脉能量而成的魔像，坚硬无比。", drop: { steel_ingot: 1, iron_ore: 3, crystal: 1 } }
    ],
    desert: [
        { name: "沙漠蛇", hp: 55, hpMax: 55, str: 8, def: 3, exp: 28, icon: "🐍", desc: "潜伏在沙中的毒蛇，行动迅捷且攻击精准。", drop: { snake_skin: 2, venom: 1 } },
        { name: "沙蝎",   hp: 60, hpMax: 60, str: 7, def: 4, exp: 30, icon: "🦂", desc: "沙漠中的巨型蝎子，蝎尾的毒针令人胆寒。", drop: { claw: 1, venom: 1 } },
        { name: "木乃伊", hp: 85, hpMax: 85, str: 10, def: 5, exp: 45, icon: "🧟", desc: "古代遗迹中的不死守护者，被诅咒束缚永生。", drop: { shadow_core: 1, gold_ore: 1 } },
        { name: "遗迹守卫", hp: 140, hpMax: 140, str: 13, def: 9, exp: 75, icon: "🗿", desc: "古代机关守卫，行动迟缓但攻击沉重。", drop: { gold_ore: 2, crystal: 2, shadow_ore: 1 } }
    ],
    snow: [
        { name: "雪狼",     hp: 65, hpMax: 65, str: 9, def: 4, exp: 35, icon: "🐺", desc: "雪原上的白色巨狼，在暴风雪中来去自如。", drop: { tiger_fur: 2, claw: 1 } },
        { name: "冰史莱姆", hp: 70, hpMax: 70, str: 7, def: 5, exp: 38, icon: "🔵", desc: "极寒中诞生的冰晶史莱姆，攻击附带冻结效果。", drop: { crystal: 2, slime_jelly: 1 } },
        { name: "雪人",     hp: 100, hpMax: 100, str: 12, def: 7, exp: 50, icon: "☃️", desc: "传说中的雪怪，蛮力惊人且皮糙肉厚。", drop: { ancient_wood: 2, life_herb: 1 } },
        { name: "寒霜巨狼", hp: 130, hpMax: 130, str: 15, def: 8, exp: 80, icon: "🐺", desc: "比雪狼更凶猛的王者，吐息带着冰霜。", drop: { tiger_fur: 3, crystal: 2, claw: 2 } }
    ],

    // 新增区域怪物
    swamp: [
        { name: "沼泽史莱姆", hp: 120, hpMax: 120, str: 14, def: 8, exp: 85, icon: "🟩", desc: "吸收瘴气的史莱姆，粘液带毒。", drop: { swamp_moss: 2, bog_ichor: 1, slime_jelly: 1 } },
        { name: "毒沼巨蛙",   hp: 150, hpMax: 150, str: 18, def: 10, exp: 110, icon: "🐸", desc: "潜伏水面的巨蛙，舌击猛烈且带毒。", drop: { bog_ichor: 2, poison_herb: 2, rough_leather: 1 } },
        { name: "腐化蜥蜴人", hp: 170, hpMax: 170, str: 22, def: 12, exp: 130, icon: "🦎", desc: "被腐化侵蚀的蜥蜴人，攻击更凶狠。", drop: { lizard_scales: 3, bog_ichor: 1, shadow_ore: 1 } },
        { name: "瘴气树妖",   hp: 200, hpMax: 200, str: 18, def: 16, exp: 150, icon: "🌿", desc: "沼泽深处的树妖，树皮厚重且散发瘴气。", drop: { swamp_moss: 3, magic_herb: 1, ancient_wood: 1 } }
    ],
    volcano: [
        { name: "熔岩蜥蜴",   hp: 180, hpMax: 180, str: 24, def: 12, exp: 150, icon: "🦎", desc: "火山岩缝中的蜥蜴，体表灼热。", drop: { obsidian: 2, fire_crystal: 1, lizard_scales: 2 } },
        { name: "黑曜石魔像", hp: 260, hpMax: 260, str: 22, def: 22, exp: 190, icon: "🗿", desc: "由黑曜石构成的魔像，防御极高。", drop: { obsidian: 3, basalt: 2, steel_ingot: 1 } },
        { name: "火灵",       hp: 160, hpMax: 160, str: 28, def: 10, exp: 175, icon: "🔥", desc: "火焰中诞生的灵体，攻势凶猛。", drop: { fire_crystal: 2, crystal: 1 } },
        { name: "裂谷霸主",   hp: 320, hpMax: 320, str: 32, def: 18, exp: 260, icon: "🌋", desc: "盘踞裂谷的强大魔物，怒火不息。", drop: { obsidian: 4, basalt: 3, fire_crystal: 2, storm_shard: 1 } }
    ],
    ruins: [
        { name: "遗迹机关兵", hp: 210, hpMax: 210, str: 26, def: 16, exp: 190, icon: "🤖", desc: "古代机关兵，动作机械却力量惊人。", drop: { ancient_relic: 2, gold_ore: 1, crystal: 1 } },
        { name: "符文守卫",   hp: 280, hpMax: 280, str: 30, def: 22, exp: 240, icon: "🗿", desc: "符文刻印的守卫者，会压制入侵者。", drop: { ancient_relic: 3, gold_ore: 2, crystal: 2 } },
        { name: "古代祭司幽魂", hp: 200, hpMax: 200, str: 34, def: 14, exp: 220, icon: "👻", desc: "祭司的残魂仍守护着禁忌。", drop: { ancient_relic: 2, holy_dust: 1, shadow_ore: 1 } },
        { name: "遗迹核心",   hp: 360, hpMax: 360, str: 36, def: 26, exp: 320, icon: "🔮", desc: "遗迹能量核心，聚合了强大防御与攻击。", drop: { ancient_relic: 4, gold_ore: 2, crystal: 4, mithril_ore: 1 } }
    ],
    sanctuary: [
        { name: "圣域守卫",   hp: 260, hpMax: 260, str: 30, def: 24, exp: 260, icon: "🛡️", desc: "圣域守护者，防御极强且意志坚定。", drop: { holy_dust: 2, crystal: 2, silver_ore: 1 } },
        { name: "光辉精灵",   hp: 220, hpMax: 220, str: 34, def: 18, exp: 240, icon: "🧝", desc: "圣光孕育的精灵，攻击带净化之力。", drop: { holy_dust: 2, life_herb: 1, elf_wood: 1 } },
        { name: "堕落骑士",   hp: 320, hpMax: 320, str: 40, def: 24, exp: 320, icon: "🐴", desc: "被黑暗侵蚀的骑士，仍残留圣光。", drop: { holy_dust: 2, shadow_core: 1, steel_ingot: 2 } },
        { name: "圣光裁决者", hp: 420, hpMax: 420, str: 44, def: 30, exp: 420, icon: "✨", desc: "圣光化身的裁决者，光辉不可直视。", drop: { holy_dust: 4, life_herb: 2, crystal: 4, adamantite: 1 } }
    ],
    abyss: [
        { name: "深渊猎犬",   hp: 340, hpMax: 340, str: 46, def: 22, exp: 420, icon: "🐺", desc: "来自深渊的猎犬，咬合力惊人。", drop: { abyss_essence: 1, shadow_core: 2, claw: 2 } },
        { name: "虚无行者",   hp: 300, hpMax: 300, str: 52, def: 20, exp: 450, icon: "🕳️", desc: "徘徊在裂隙边缘的行者，攻击诡异。", drop: { abyss_essence: 1, shadow_ore: 2, storm_shard: 1 } },
        { name: "深渊巨像",   hp: 520, hpMax: 520, str: 50, def: 40, exp: 600, icon: "🗿", desc: "深渊能量凝成的巨像，硬得可怕。", drop: { abyss_essence: 2, adamantite: 1, shadow_ore: 3 } },
        { name: "深渊领主",   hp: 700, hpMax: 700, str: 62, def: 36, exp: 900, icon: "👑", desc: "深渊的统治者之一，压迫感令人窒息。", drop: { abyss_essence: 3, dragon_scale: 1, shadow_core: 3, storm_shard: 2 } }
    ]
};

/** 冒险区域 */
const AREAS = {
    grassland: { name: "草原",     icon: "🌾", desc: "一望无际的翠绿草原，冒险开始的地方，栖息着温和的魔物。", gather: ['wood', 'herb', 'rough_leather'] },
    forest:    { name: "幽暗森林", icon: "🌲", desc: "参天古木遮蔽天日的密林，潜伏着凶猛的野兽与树精。", gather: ['hard_wood', 'red_herb', 'wolf_leather'] },
    mine:      { name: "矿山",     icon: "⛰️", desc: "深不见底的矿洞，蕴藏丰富矿石但也危机四伏。", gather: ['copper_ore', 'iron_ore', 'crystal'] },
    desert:    { name: "沙漠",     icon: "🏜️", desc: "漫天黄沙的荒芜沙漠，毒虫与不死生物横行。", gather: ['fire_crystal', 'snake_skin'] },
    snow:      { name: "雪地",     icon: "❄️", desc: "终年冰封的极寒雪原，只有最顽强的生物才能生存。", gather: ['silver_ore', 'bear_leather'] },

    // 新增区域（更高阶素材/套装核心来源）
    swamp:     { name: "腐化沼泽", icon: "🟩", desc: "瘴气弥漫的沼泽地，毒素与腐化生物横行。", gather: ['swamp_moss', 'poison_herb', 'bog_ichor'] },
    volcano:   { name: "火山裂谷", icon: "🌋", desc: "炽热岩浆与黑曜石遍布的裂谷，稍有不慎便会葬身火海。", gather: ['obsidian', 'basalt', 'fire_crystal'] },
    ruins:     { name: "古代遗迹", icon: "🏛️", desc: "尘封千年的遗迹迷宫，机关与守护者仍在运作。", gather: ['ancient_relic', 'gold_ore', 'crystal'] },
    sanctuary: { name: "圣光圣域", icon: "✨", desc: "被圣光庇护的圣域，净化之力能驱散黑暗。", gather: ['holy_dust', 'life_herb', 'crystal'] },
    abyss:     { name: "深渊边境", icon: "🕳️", desc: "通往深渊的裂隙边境，黑暗与低语盘旋不散。", gather: ['abyss_essence', 'shadow_ore', 'shadow_core'] }
};

/** 锻造配方（匹配所有装备，左右手独立配方） */
const FORGE_RECIPES = {
    // 右手武器
    wooden_sword: { materials: { wood: 5 }, level: 1 },
    iron_sword:   { materials: { iron_ore: 6, wood: 3 }, level: 2 },
    steel_sword:  { materials: { steel_ingot: 2, iron_ore: 2, wood: 2 }, level: 3 },
    mithril_sword:{ materials: { mithril_ore: 3, steel_ingot: 1, crystal: 1 }, level: 4 },
    flame_blade:  { materials: { steel_ingot: 2, fire_crystal: 2, crystal: 1 }, level: 4 },
    shadow_dagger:{ materials: { shadow_ore: 2, steel_ingot: 1, shadow_core: 1 }, level: 4 },
    // 左手盾牌
    wooden_shield: { materials: { wood: 6, rough_leather: 2 }, level: 1 },
    iron_shield:   { materials: { iron_ore: 7, rough_leather: 3 }, level: 2 },
    steel_shield:  { materials: { steel_ingot: 2, iron_ore: 3, rough_leather: 2 }, level: 3 },
    mithril_shield:{ materials: { mithril_ore: 3, steel_ingot: 1, crystal: 1 }, level: 4 },
    mirror_buckler:{ materials: { silver_ore: 4, crystal: 2 }, level: 4 },
    // 防具
    cloth_hat:   { materials: { rough_leather: 3 }, level: 1 },
    leather_hat: { materials: { rough_leather: 2, wolf_leather: 2 }, level: 1 },
    cloth_pants: { materials: { rough_leather: 2 }, level: 1 },
    cloth_shoes: { materials: { rough_leather: 2 }, level: 1 },
    copper_armor: { materials: { copper_ore: 4, rough_leather: 2 }, level: 1 },
    iron_hat:   { materials: { iron_ore: 5 }, level: 2 },
    iron_pants: { materials: { iron_ore: 6 }, level: 2 },
    iron_shoes: { materials: { iron_ore: 4 }, level: 2 },
    steel_armor:{ materials: { steel_ingot: 3, iron_ore: 2 }, level: 3 },
    steel_pants:{ materials: { steel_ingot: 2, iron_ore: 2 }, level: 3 },
    steel_boots:{ materials: { steel_ingot: 2, iron_ore: 1 }, level: 3 },
    mage_hood:  { materials: { crystal: 2, blue_herb: 2, elf_wood: 1 }, level: 3 },
    mithril_armor:{ materials: { mithril_ore: 4, ancient_wood: 2, crystal: 2 }, level: 4 },

    // ====================== 新增：飾品鍛造配方（對應 15+ 種特殊效果） ======================
    // Lv2：較早期即可接觸到的功能性飾品
    ward_charm:      { materials: { crystal: 1, silver_ore: 1, rough_leather: 1 }, level: 2 },
    thorn_brooch:    { materials: { claw: 1, rough_leather: 2, iron_ore: 1 }, level: 2 },
    execution_ring:  { materials: { iron_ore: 2, tooth: 1, crystal: 1 }, level: 2 },
    pierce_talisman: { materials: { iron_ore: 2, copper_ore: 2, crystal: 1 }, level: 2 },
    lucky_coin:      { materials: { copper_ore: 2, silver_ore: 1 }, level: 2 },

    // Lv3：中期飾品（開始出現「戰鬥節奏/資源」類效果）
    vampire_tooth:   { materials: { tooth: 2, venom: 1, crystal: 1 }, level: 3 },
    combo_band:      { materials: { wolf_leather: 2, steel_ingot: 1, crystal: 1 }, level: 3 },
    blessing_bead:   { materials: { crystal: 2, feather: 1, blue_herb: 1 }, level: 3 },
    herbal_mortar:   { materials: { herb: 3, red_herb: 1, crystal: 1 }, level: 3 },
    victory_chime:   { materials: { crystal: 2, silver_ore: 1, blue_herb: 2 }, level: 3 },

    // Lv4：後期飾品（偏強、偏機制）
    firststrike_pin: { materials: { storm_shard: 1, steel_ingot: 1, crystal: 2 }, level: 4 },
    unyielding_sig:  { materials: { holy_dust: 2, life_herb: 1, crystal: 2 }, level: 4 },
    storm_seal:      { materials: { storm_shard: 2, mithril_ore: 1, crystal: 2 }, level: 4 },
    gorgon_eye:      { materials: { shadow_core: 1, shadow_ore: 2, crystal: 2 }, level: 4 },
    shield_fury_gem: { materials: { crystal: 2, steel_ingot: 1, silver_ore: 1 }, level: 4 },
    secret_compass:  { materials: { ancient_relic: 2, crystal: 2, mithril_ore: 1 }, level: 4 },

    // ====================== 新增：套装装备锻造配方（8套，共32件） ======================
    // 旅人（Lv1）
    traveler_cap:   { materials: { rough_leather: 3, herb: 2 }, level: 1 },
    traveler_coat:  { materials: { rough_leather: 5, wood: 3 }, level: 1 },
    traveler_pants: { materials: { rough_leather: 4, herb: 1 }, level: 1 },
    traveler_boots: { materials: { rough_leather: 4, wood: 1 }, level: 1 },

    // 守卫（Lv2）
    guard_helm:     { materials: { iron_ore: 6, rough_leather: 2 }, level: 2 },
    guard_armor:    { materials: { iron_ore: 10, rough_leather: 3 }, level: 2 },
    guard_greaves:  { materials: { iron_ore: 8, rough_leather: 2 }, level: 2 },
    guard_sabatons: { materials: { iron_ore: 7, rough_leather: 2 }, level: 2 },

    // 游侠（Lv2）
    ranger_hood:    { materials: { wolf_leather: 3, hard_wood: 2 }, level: 2 },
    ranger_vest:    { materials: { wolf_leather: 5, hard_wood: 2 }, level: 2 },
    ranger_pants:   { materials: { wolf_leather: 4, hard_wood: 1 }, level: 2 },
    ranger_boots:   { materials: { wolf_leather: 4, hard_wood: 1 }, level: 2 },

    // 法师（Lv3）
    mage_hat:       { materials: { crystal: 2, blue_herb: 2, elf_wood: 1 }, level: 3 },
    mage_robe:      { materials: { crystal: 3, blue_herb: 2, elf_wood: 2 }, level: 3 },
    mage_pants:     { materials: { crystal: 2, blue_herb: 1, rough_leather: 2 }, level: 3 },
    mage_shoes:     { materials: { crystal: 2, blue_herb: 1, rough_leather: 2 }, level: 3 },

    // 暗影（Lv4）
    shadow_mask:    { materials: { shadow_ore: 2, shadow_leather: 3, shadow_core: 1 }, level: 4 },
    shadow_mail:    { materials: { shadow_ore: 3, shadow_leather: 6, shadow_core: 1 }, level: 4 },
    shadow_legs:    { materials: { shadow_ore: 2, shadow_leather: 5, shadow_core: 1 }, level: 4 },
    shadow_steps:   { materials: { shadow_ore: 2, shadow_leather: 4, shadow_core: 1 }, level: 4 },

    // 火山（Lv4）
    volcanic_helm:  { materials: { obsidian: 3, basalt: 2, steel_ingot: 1 }, level: 4 },
    volcanic_armor: { materials: { obsidian: 5, basalt: 3, steel_ingot: 2 }, level: 4 },
    volcanic_legs:  { materials: { obsidian: 4, basalt: 2, steel_ingot: 2 }, level: 4 },
    volcanic_boots: { materials: { obsidian: 4, basalt: 2, steel_ingot: 1 }, level: 4 },

    // 圣光（Lv4）
    holy_circlet:   { materials: { holy_dust: 3, crystal: 2, silver_ore: 2 }, level: 4 },
    holy_mail:      { materials: { holy_dust: 4, crystal: 3, steel_ingot: 2 }, level: 4 },
    holy_legs:      { materials: { holy_dust: 3, crystal: 2, steel_ingot: 2 }, level: 4 },
    holy_boots:     { materials: { holy_dust: 3, crystal: 2, steel_ingot: 1 }, level: 4 },

    // 深渊（Lv4）
    abyss_helm:     { materials: { abyss_essence: 1, shadow_ore: 3, adamantite: 1 }, level: 4 },
    abyss_armor:    { materials: { abyss_essence: 2, shadow_ore: 5, adamantite: 1 }, level: 4 },
    abyss_legs:     { materials: { abyss_essence: 1, shadow_ore: 4, adamantite: 1 }, level: 4 },
    abyss_boots:    { materials: { abyss_essence: 1, shadow_ore: 4, steel_ingot: 2 }, level: 4 }
};

/** 制作配方（全食物/道具） */
const CRAFT_RECIPES = {
    herb_tea:       { materials: { herb: 3 }, item: "herb_tea" },
    steak:          { materials: { meat: 2, herb: 1 }, item: "steak" },
    mushroom_soup:  { materials: { herb: 2, slime_jelly: 1 }, item: "mushroom_soup" },
    honey_water:    { materials: { herb: 1, red_herb: 1 }, item: "honey_water" },
    stamina_jerky:  { materials: { meat: 2 }, item: "stamina_jerky" },
    elixir:         { materials: { golden_herb: 1, life_herb: 1, crystal: 1 }, item: "elixir" },
    antidote:       { materials: { poison_herb: 2, herb: 1 }, item: "antidote" }
};

// ========================== 辅助函数：获取物品图标与描述 ==========================
function getEquipIcon(item) {
    if (!item) return "";
    if (item.icon) return item.icon;
    const ref = EQUIPMENTS[item.id];
    return ref ? ref.icon : "";
}

function getEquipDesc(item) {
    if (!item) return "";
    if (item.desc) return item.desc;
    const ref = EQUIPMENTS[item.id];
    return ref ? ref.desc : "";
}

// ========================== 装备实例/强化计算（统一出口，避免逻辑分散） ==========================
/**
 * 以「装备模板 + 等级」生成实际装备实例。
 * - 等级从 1 开始
 * - 属性成长是确定性的：同ID同等级永远得到同属性（便于存档/回溯/显示）
 */
function createEquipmentInstance(id, level = 1) {
    const base = EQUIPMENTS[id];
    if (!base) return null;
    const lv = Math.max(1, Number(level) || 1);

    // 強化成長（確定性且「每次強化都看得到提升」）
    // 先前用 Math.floor(base * (1 + 0.15*(lv-1))) 對於小數值（例如 base=2）會出現 +2 -> 仍為 2 的情況。
    // 新規則：在 15% 成長之外，額外給每級固定 +1（僅對 base>0 生效），確保每升 1 級都會成長。
    const step = lv - 1;
    const growStat = (v) => {
        const baseVal = Number(v) || 0;
        if (baseVal <= 0) return 0;
        return baseVal + step + Math.floor(baseVal * 0.15 * step);
    };
    return {
        ...base,
        id,
        level: lv,
        str: growStat(base.str),
        def: growStat(base.def),
        hp: growStat(base.hp),
        mp: growStat(base.mp)
    };
}

// ========================== 初始化（安全兜底，无undefined） ==========================
document.addEventListener("DOMContentLoaded", () => {
    try {
        initSave();
        gameData = loadGame();
        repairOldSave();
        initTabs();
        initEquipSlots();
        initDungeon();
        renderAll();
        showToast("🎮 游戏加载完成！左右手装备独立穿脱已修复");
    } catch (e) {
        console.error("初始化错误：", e);
        showToast("❌ 游戏加载失败");
    }
});

/** 修复旧存档：补全所有缺失的装备栏/字段 */
function repairOldSave() {
    const defaultData = getDefaultGameData();
    if (!gameData.character) gameData.character = defaultData.character;
    if (!gameData.bag) gameData.bag = defaultData.bag;
    if (!gameData.equipped) gameData.equipped = defaultData.equipped;
    for (const slot in defaultData.equipped) {
        if (gameData.equipped[slot] === undefined) gameData.equipped[slot] = null;
    }
    if (!gameData.battleRecord) gameData.battleRecord = [];
    if (!gameData.currentArea) gameData.currentArea = "grassland";
    if (!gameData.dungeon) gameData.dungeon = defaultData.dungeon;
    if (gameData.dungeon.floor === undefined) gameData.dungeon.floor = 1;
    if (gameData.dungeon.bestFloor === undefined) gameData.dungeon.bestFloor = 1;
    if (!Array.isArray(gameData.dungeon.record)) gameData.dungeon.record = [];
}

// ========================== UI核心功能 ==========================
function initTabs() {
    const tabs = document.querySelectorAll(".tab-btn");
    tabs.forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));
            btn.classList.add("active");
            const tab = btn.dataset.tab;
            document.getElementById(tab).classList.add("active");
            renderAll();
        });
    });
}

function showToast(msg) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2000);
}

function renderAll() {
    try {
        // 先初始化一次篩選 UI（避免 renderXXX 內重複 query 太多次）
        initFilterUIIfNeeded();
        renderRole();
        renderBattle();
        renderDungeon();
        renderBag();
        renderCraft();
        renderForge();
        renderEnhance();
    } catch (e) {
        console.error("渲染错误：", e);
    }
}

// ========================== 地下城系统（无尽层） ==========================
function initDungeon() {
    document.getElementById("dungeon-fight-btn")?.addEventListener("click", () => {
        dungeonFight();
    });
    document.getElementById("dungeon-reset-btn")?.addEventListener("click", () => {
        if (!confirm("确定要重置到第1层吗？")) return;
        gameData.dungeon.floor = 1;
        gameData.dungeon.record.unshift(`[${new Date().toLocaleTimeString()}] 🔄 地下城已重置到第1层`);
        showToast("🔄 已重置地下城");
        renderAll();
        saveGame();
    });
}

function renderDungeon() {
    const info = document.getElementById("dungeon-info");
    const record = document.getElementById("dungeon-record");
    if (!info || !record) return;

    const d = gameData?.dungeon || { floor: 1, bestFloor: 1, record: [] };
    const total = calculateTotalStats();
    info.innerHTML = `
        <div><strong>目前层数：</strong>第 ${d.floor} 层</div>
        <div><strong>最高纪录：</strong>第 ${d.bestFloor} 层</div>
        <div style="margin-top:8px; opacity:0.9;">你的当前战力：⚔️${total.str} 🛡️${total.def} ❤️${total.hpMax} 💙${total.mpMax}</div>
        <div style="margin-top:8px; opacity:0.9;">提示：每5层会明显提升掉落数量与稀有素材出现率。</div>
    `;
    record.innerHTML = (d.record || []).slice(0, 30).map(x => `<div>${x}</div>`).join("") || "<div>（暂无纪录）</div>";
}

function pickDungeonBaseMonster(floor) {
    // 随层数逐步引入更高阶区域的怪物池
    const pools = [
        { at: 1, areas: ["grassland", "forest"] },
        { at: 6, areas: ["mine", "desert", "snow"] },
        { at: 16, areas: ["swamp", "ruins"] },
        { at: 26, areas: ["volcano", "sanctuary"] },
        { at: 41, areas: ["abyss"] }
    ];
    let areas = pools[0].areas;
    for (const p of pools) {
        if (floor >= p.at) areas = p.areas;
    }
    const area = areas[Math.floor(Math.random() * areas.length)];
    const list = MONSTERS[area] || [];
    if (list.length === 0) return null;
    const base = { ...list[Math.floor(Math.random() * list.length)] };
    base.__area = area;
    return base;
}

function scaleDungeonMonster(base, floor) {
    if (!base) return null;
    const f = Math.max(1, Number(floor) || 1);
    // 指数成长：让无尽层在高层仍有挑战
    const hpMul = Math.pow(1.07, f - 1);
    const strMul = Math.pow(1.055, f - 1);
    const defMul = Math.pow(1.045, f - 1);
    const expMul = Math.pow(1.06, f - 1);
    const hpMax = Math.max(10, Math.floor((base.hpMax || base.hp || 10) * hpMul));
    return {
        ...base,
        name: `${base.name}（第${f}层）`,
        hpMax,
        hp: hpMax,
        str: Math.max(1, Math.floor((base.str || 1) * strMul)),
        def: Math.max(0, Math.floor((base.def || 0) * defMul)),
        exp: Math.max(1, Math.floor((base.exp || 1) * expMul))
    };
}

function rollDungeonExtraDrops(floor) {
    // 稀有掉落：层数越高几率越大
    const f = Math.max(1, Number(floor) || 1);
    const result = {};

    const roll = (chance, mat, min = 1, max = 1) => {
        if (Math.random() < chance) {
            const cnt = min + Math.floor(Math.random() * (max - min + 1));
            result[mat] = (result[mat] || 0) + cnt;
        }
    };

    // 每5层加成一档
    const tier = Math.floor((f - 1) / 5);
    roll(Math.min(0.10 + tier * 0.02, 0.45), "crystal", 1, 1 + Math.floor(tier / 2));
    roll(Math.min(0.06 + tier * 0.015, 0.35), "steel_ingot", 1, 1 + Math.floor(tier / 3));
    roll(Math.min(0.03 + tier * 0.01, 0.25), "mithril_ore", 1, 1);
    roll(Math.min(0.02 + tier * 0.008, 0.18), "adamantite", 1, 1);
    roll(Math.min(0.02 + tier * 0.008, 0.18), "storm_shard", 1, 1);
    if (f >= 35) roll(Math.min(0.01 + (f - 35) * 0.002, 0.12), "holy_dust", 1, 2);
    if (f >= 45) roll(Math.min(0.01 + (f - 45) * 0.002, 0.12), "abyss_essence", 1, 1);
    if (f >= 60) roll(Math.min(0.006 + (f - 60) * 0.0015, 0.06), "dragon_scale", 1, 1);
    return result;
}

async function dungeonFight() {
    try {
        const d = gameData.dungeon;
        const floor = Math.max(1, Number(d.floor) || 1);
        const base = pickDungeonBaseMonster(floor);
        const enemy = scaleDungeonMonster(base, floor);
        if (!enemy) {
            showToast("❌ 地下城怪物池为空");
            return;
        }

        const char = gameData.character;
        const totalStats = calculateTotalStats();
        const battleInfo = document.getElementById("dungeon-info");

        // 飾品/套裝：地下城戰鬥開始事件
        const logLines = [];
        const startCtx = { mode: "dungeon", char, total: totalStats, enemy, logLines };
        triggerAccessoryEvent("battleStart", startCtx);
        triggerSetEvent("battleStart", startCtx);

        let log = `🏰 第${floor}层遭遇【${enemy.icon || ""} ${enemy.name}】！\n${enemy.desc || ""}`;
        if (logLines.length) log += `\n${logLines.join("\n")}`;
        d.record.unshift(`[${new Date().toLocaleTimeString()}] ${log}`);
        battleInfo.innerHTML = log.replace(/\n/g, "<br>");

        while (char.hp > 0 && enemy.hp > 0) {
            await new Promise(resolve => setTimeout(resolve, 650));

            // 玩家出手：可被飾品/套裝改寫 damage
            const playerCtx = { mode: "dungeon", char, total: totalStats, enemy, damage: Math.max(1, totalStats.str - enemy.def), logLines: [] };
            triggerAccessoryEvent("beforePlayerAttack", playerCtx);
            triggerSetEvent("beforePlayerAttack", playerCtx);
            const playerDmg = Math.max(1, Math.floor(playerCtx.damage || 1));
            enemy.hp -= playerDmg;
            const afterPlayerCtx = { mode: "dungeon", char, total: totalStats, enemy, damageDealt: playerDmg, logLines: playerCtx.logLines };
            triggerAccessoryEvent("afterPlayerAttack", afterPlayerCtx);
            triggerSetEvent("afterPlayerAttack", afterPlayerCtx);
            log += `\n你造成${playerDmg}点伤害（怪物HP:${Math.max(0, enemy.hp)}/${enemy.hpMax}）`;
            if (playerCtx.logLines.length) log += `\n${playerCtx.logLines.join("\n")}`;
            if (enemy.hp > 0) {

                // 敵方出手（先算基礎傷害，再經飾品調整，最後套護盾）
                const baseEnemyDmg = Math.max(1, enemy.str - totalStats.def);
                const enemyCtx = { mode: "dungeon", char, total: totalStats, enemy, damage: baseEnemyDmg, logLines: [] };
                triggerAccessoryEvent("beforeEnemyAttack", enemyCtx);
                triggerSetEvent("beforeEnemyAttack", enemyCtx);
                let enemyDmg = Math.max(0, Math.floor(enemyCtx.damage || 0));

                // 護盾吸收
                if ((char.__shield || 0) > 0 && enemyDmg > 0) {
                    const absorb = Math.min(char.__shield, enemyDmg);
                    char.__shield -= absorb;
                    enemyDmg -= absorb;
                    enemyCtx.logLines.push(addBattleLogLine(`🛡️ 護盾吸收 ${absorb} 伤害（剩余护盾 ${char.__shield}）`));
                }
                char.hp -= enemyDmg;
                const afterEnemyCtx = { mode: "dungeon", char, total: totalStats, enemy, damageDealt: enemyDmg, logLines: enemyCtx.logLines };
                triggerAccessoryEvent("afterEnemyAttack", afterEnemyCtx);
                triggerSetEvent("afterEnemyAttack", afterEnemyCtx);
                log += `\n${enemy.name}造成${enemyDmg}点伤害（你的HP:${Math.max(0, char.hp)}/${totalStats.hpMax}）`;
                if (enemyCtx.logLines.length) log += `\n${enemyCtx.logLines.join("\n")}`;
            }
            battleInfo.innerHTML = log.replace(/\n/g, "<br>");
        }

        if (char.hp <= 0) {
            log += "\n💀 你在地下城被击败了！（HP保留为1）";
            char.hp = 1;
            showToast("💀 地下城挑战失败");
            d.record.unshift(`[${new Date().toLocaleTimeString()}] ❌ 第${floor}层挑战失败`);
        } else {
            // 勝利事件：允許飾品追加掉落/回復等
            const drops = { ...(enemy.drop || {}) };
            const victoryLines = [];
            const victoryCtx = { mode: "dungeon", char, total: totalStats, enemy, drops, logLines: victoryLines };
            triggerAccessoryEvent("victory", victoryCtx);
            triggerSetEvent("victory", victoryCtx);

            log += `\n🎉 通关第${floor}层！获得${enemy.exp}经验`;
            char.exp += enemy.exp;

            // 基础掉落：层数越高额外数量越多
            const qtyBonus = Math.floor((floor - 1) / 5);
            for (const mat in drops) {
                const baseCnt = drops[mat];
                const extra = (qtyBonus > 0) ? Math.floor(Math.random() * (qtyBonus + 1)) : 0;
                const cnt = Math.max(1, baseCnt + extra);
                gameData.bag.materials[mat] = (gameData.bag.materials[mat] || 0) + cnt;
                const m = MATERIALS[mat];
                log += `\n获得 ${m?.icon || ""} ${m?.name || mat} x${cnt}`;
            }

            if (victoryLines.length) log += `\n${victoryLines.join("\n")}`;

            // 稀有追加掉落
            const extraDrops = rollDungeonExtraDrops(floor);
            for (const mat in extraDrops) {
                const cnt = extraDrops[mat];
                gameData.bag.materials[mat] = (gameData.bag.materials[mat] || 0) + cnt;
                const m = MATERIALS[mat];
                log += `\n✨ 额外获得 ${m?.icon || ""} ${m?.name || mat} x${cnt}`;
            }

            checkLevelUp();
            d.floor = floor + 1;
            d.bestFloor = Math.max(d.bestFloor || 1, floor);
            showToast(`🎉 通关第${floor}层！前往第${d.floor}层`);
            d.record.unshift(`[${new Date().toLocaleTimeString()}] ✅ 通关第${floor}层 → 前往第${d.floor}层`);
        }

        battleInfo.innerHTML = log.replace(/\n/g, "<br>");
        // 限制纪录长度，避免存档膨胀
        d.record = (d.record || []).slice(0, 60);
        renderAll();
        saveGame();
    } catch (e) {
        console.error(e);
        showToast("❌ 地下城战斗异常");
    }
}

// ========================== 角色属性计算 ==========================
function calculateTotalStats() {
    if (!gameData || !gameData.character) return getDefaultGameData().character;
    const base = gameData.character;
    const equip = gameData.equipped;
    let total = {
        str: base.str || 0, dex: base.dex || 0, tec: base.tec || 0,
        def: base.def || 0, mag: base.mag || 0,
        hpMax: base.hpMax || 100, mpMax: base.mpMax || 50
    };
    for (const key in equip) {
        const item = equip[key];
        if (item && typeof item === "object") {
            total.str += item.str || 0;
            total.def += item.def || 0;
            total.hpMax += item.hp || 0;
            total.mpMax += item.mp || 0;
        }
    }

    // 套装加成
    const setBonus = calculateSetBonuses();
    total.str += setBonus.str || 0;
    total.def += setBonus.def || 0;
    total.hpMax += setBonus.hpMax || 0;
    total.mpMax += setBonus.mpMax || 0;
    return total;
}

/** 计算目前穿戴的套装件数与套装加成（仅影响战斗用总属性与角色显示） */
function calculateSetBonuses() {
    const equip = gameData?.equipped || {};
    const counts = {}; // setId -> pieces
    for (const slot in equip) {
        const it = equip[slot];
        const setId = it?.setId;
        if (!setId) continue;
        counts[setId] = (counts[setId] || 0) + 1;
    }

    const bonus = { str: 0, def: 0, hpMax: 0, mpMax: 0, active: [] };
    for (const setId in counts) {
        const pieces = counts[setId];
        const setDef = SETS[setId];
        if (!setDef) continue;
        const thresholds = Object.keys(setDef.bonuses)
            .map(n => Number(n))
            .filter(n => !Number.isNaN(n))
            .sort((a, b) => a - b);
        for (const t of thresholds) {
            if (pieces >= t) {
                const b = setDef.bonuses[t];
                bonus.str += b.str || 0;
                bonus.def += b.def || 0;
                bonus.hpMax += b.hpMax || 0;
                bonus.mpMax += b.mpMax || 0;
                bonus.active.push(`${setDef.name} ${b.desc}`);
            }
        }
    }
    return bonus;
}

function renderRole() {
    const totalStats = calculateTotalStats();
    const char = gameData.character;
    const container = document.getElementById("roleStats");
    if (!container) return;
    const setBonus = calculateSetBonuses();
    // 額外：套裝「特殊效果」敘述（2/4件）
    const setCounts = getEquippedSetCounts();
    const specialLines = [];
    for (const setId in setCounts) {
        const pieces = setCounts[setId];
        const setName = getSetName(setId);
        // 依目前有達成的 tier 顯示
        const tiers = Object.keys(SET_EFFECTS?.[setId]?.tiers || {})
            .map(n => Number(n))
            .filter(n => !Number.isNaN(n))
            .sort((a, b) => a - b);
        for (const t of tiers) {
            if (pieces < t) continue;
            const desc = getSetEffectDesc(setId, t);
            if (desc) specialLines.push(`${setName} (${t}) ${desc}`);
        }
    }

    const setText = (setBonus.active.length > 0 || specialLines.length > 0)
        ? `<div style="margin-top:10px;"><strong>🧩 套裝效果</strong><br>${[
            ...setBonus.active.map(s => `- ${s}`),
            ...(specialLines.length ? ["<span style=\"opacity:0.9;\">特殊效果：</span>"] : []),
            ...specialLines.map(s => `- ${s}`)
        ].join("<br>")}</div>`
        : `<div style="margin-top:10px; opacity:0.85;"><strong>🧩 套裝效果</strong><br>（尚未啟用）</div>`;
    container.innerHTML = `
        <div>等级：Lv.${char.level || 1}</div>
        <div>经验：${char.exp || 0}/${char.expMax || 100}</div>
        <div>体力：${Math.min(char.hp || 0, totalStats.hpMax)}/${totalStats.hpMax}</div>
        <div>魔力：${Math.min(char.mp || 0, totalStats.mpMax)}/${totalStats.mpMax}</div>
        <div>力量：${totalStats.str}</div>
        <div>敏捷：${totalStats.dex}</div>
        <div>技巧：${totalStats.tec}</div>
        <div>防御：${totalStats.def}</div>
        <div>魔力：${totalStats.mag}</div>
        <div>锻造等级：Lv.${char.forgeLevel || 1}</div>
        ${setText}
    `;
}

// ========================== 装备栏系统（左右手完全独立） ==========================
function initEquipSlots() {
    const slots = document.querySelectorAll(".equip-slot");
    slots.forEach(slot => {
        slot.addEventListener("click", () => {
            const slotName = slot.dataset.slot;
            takeOffEquip(slotName);
        });
    });
}

function renderEquipSlots() {
    for (const slotName in gameData.equipped) {
        const dom = document.getElementById(slotName);
        const item = gameData.equipped[slotName];
        if (dom) {
            if (item) {
                const icon = getEquipIcon(item);
                dom.innerHTML = `${icon} ${item.name}<br>[+${item.level || 1}]`;
                dom.title = getEquipDesc(item) || item.name;
            } else {
                dom.innerHTML = "空";
                dom.title = "";
            }
        }
    }
}

function takeOffEquip(slotName) {
    try {
        if (!gameData.equipped[slotName]) return;
        const item = gameData.equipped[slotName];
        gameData.equipped[slotName] = null;
        gameData.bag.equipments.push(item);
        showToast(`🎽 脱下【${item.name}】成功！`);
        renderAll();
        saveGame();
    } catch (e) {
        showToast("❌ 脱下失败");
    }
}

// ========================== 背包系统（核心修复：左右手独立穿戴） ==========================
function renderBag() {
    try {
        initFilterUIIfNeeded();
        renderEquipSlots();
        const bag = gameData.bag;
        const container = document.getElementById("content-display");
        if (!container) return;
        let html = ``;

        // 動態更新：背包裝備等級選單（裝備變動時也能跟著更新）
        const bagLvSelect = document.getElementById("bag-filter-level");
        if (bagLvSelect) {
            const prev = uiState.bagEquipFilter.level;
            const levels = (bag.equipments || []).map(it => it?.level).filter(Boolean);
            bagLvSelect.innerHTML = createNumberOptionsHtml(levels, { includeAll: true, allLabel: "全部" });
            bagLvSelect.value = prev;
        }

        // 食物（卡片化）
        html += `<div class="bag-section">`;
        html += `<div class="bag-section__title">📌 食物</div>`;
        html += `<div class="bag-list">`;
        let foodCount = 0;
        for (const [key, count] of Object.entries(bag.foods || {})) {
            if (count <= 0 || !FOODS[key]) continue;
            foodCount++;
            const f = FOODS[key];
            const effectText = `效果：${f.hp ? `❤️+${f.hp}` : ""}${(f.hp && f.mp) ? " " : ""}${f.mp ? `💙+${f.mp}` : ""}`.trim();
            const meta = `${effectText}\n${f.desc || ""}`.trim();
            html += `
                <div class="bag-item">
                    <div>
                        <div class="bag-item__name">${f.icon} ${f.name} x${count}</div>
                        <div class="bag-item__meta">${meta}</div>
                    </div>
                    <div class="bag-item__actions">
                        <button class="ui-btn" onclick="useFood('${key}')" title="${f.desc}\n${effectText}">使用</button>
                        <button class="ui-btn ui-btn--ghost" onclick="dropItem('food','${key}')" title="丟棄">丢弃</button>
                    </div>
                </div>
            `;
        }
        if (foodCount === 0) {
            html += `<div style="opacity:0.85;">（沒有食物）</div>`;
        }
        html += `</div></div>`;

        // 装备（卡片化 + 篩選）
        html += `<div class="bag-section">`;
        html += `<div class="bag-section__title">📌 裝備（右手=武器 / 左手=盾牌）</div>`;
        html += `<div class="bag-list">`;
        const equips = bag.equipments || [];
        const f = uiState.bagEquipFilter;
        const filteredIdxs = [];
        for (let idx = 0; idx < equips.length; idx++) {
            const item = equips[idx];
            if (!item || !EQUIPMENTS[item.id]) continue;
            const itemSet = item.setId || null;
            const itemSlotGroup = getSlotGroup(item.type);

            // 套裝
            if (f.setId !== "all") {
                if (f.setId === "none" && itemSet) continue;
                if (f.setId !== "none" && itemSet !== f.setId) continue;
            }
            // 等級
            if (f.level !== "all") {
                const lv = Math.max(1, Number(item.level) || 1);
                if (String(lv) !== String(f.level)) continue;
            }
            // 部位
            if (f.slot !== "all") {
                if (itemSlotGroup !== f.slot) continue;
            }
            filteredIdxs.push(idx);
        }

        if (filteredIdxs.length === 0) {
            html += `<div style="opacity:0.85;">（沒有符合條件的裝備）</div>`;
        } else {
            filteredIdxs.forEach((idx) => {
                const item = equips[idx];
                const slotType = item.type === "rightHand" ? "右手" : item.type === "leftHand" ? "左手" : (SLOT_LABELS[getSlotGroup(item.type)] || item.type);
                const icon = getEquipIcon(item);
                const desc = getEquipDesc(item);
                const statsText = `⚔️+${item.str || 0} 🛡️+${item.def || 0} ❤️+${item.hp || 0} 💙+${item.mp || 0}`;
                const specialText = getItemSpecialEffectText(item);
                const setName = item.setId ? getSetName(item.setId) : "";
                const title = `${desc}\n${statsText}${specialText ? `\n\n${specialText}` : ""}`;
                const metaLines = [
                    `部位：${slotType}${setName ? ` / 套裝：${setName}` : ""}`,
                    statsText,
                    specialText
                ].filter(Boolean).join("\n");

                html += `
                    <div class="bag-item">
                        <div>
                            <div class="bag-item__name">${icon} ${item.name} [+${item.level || 1}]</div>
                            <div class="bag-item__meta">${metaLines}</div>
                        </div>
                        <div class="bag-item__actions">
                            <button class="ui-btn" onclick="equipItem(${idx})" title="${title}">穿戴</button>
                            <button class="ui-btn ui-btn--ghost" onclick="dropItem('equip',${idx})" title="丟棄">丢弃</button>
                        </div>
                    </div>
                `;
            });
        }
        html += `</div></div>`;

        // 素材（卡片化）
        html += `<div class="bag-section">`;
        html += `<div class="bag-section__title">📌 素材</div>`;
        html += `<div class="bag-list">`;
        let matCount = 0;
        for (const [key, count] of Object.entries(bag.materials || {})) {
            if (count <= 0 || !MATERIALS[key]) continue;
            matCount++;
            const m = MATERIALS[key];
            const meta = (m.desc || "").trim();
            html += `
                <div class="bag-item">
                    <div>
                        <div class="bag-item__name">${m.icon} ${m.name} x${count}</div>
                        <div class="bag-item__meta">${meta}</div>
                    </div>
                    <div class="bag-item__actions">
                        <button class="ui-btn ui-btn--ghost" onclick="dropItem('mat','${key}')" title="${m.desc}\n(丟棄)">丢弃</button>
                    </div>
                </div>
            `;
        }
        if (matCount === 0) {
            html += `<div style="opacity:0.85;">（沒有素材）</div>`;
        }
        html += `</div></div>`;

        container.innerHTML = html;
    } catch (e) {
        console.error("背包渲染错误：", e);
    }
}

/** 核心修复：严格按照装备type穿戴到对应插槽，左右手完全独立 */
function equipItem(index) {
    try {
        const equipments = gameData.bag.equipments || [];
        const item = equipments[index];
        if (!item || !item.type) return;

        // 飾品特例：允許 type="accessory"，自動放到第一個空的飾品欄位（accessory1~5）
        // 若全滿，則替換 accessory1。
        if (item.type === "accessory") {
            const slots = ["accessory1","accessory2","accessory3","accessory4","accessory5"];
            let target = slots.find(s => !gameData.equipped?.[s]);
            if (!target) target = "accessory1";
            item.type = target;
        }

        // 强制校验插槽合法性（左右手严格分离）
        const validSlots = ["rightHand","leftHand","hat","chest","pants","shoes","accessory1","accessory2","accessory3","accessory4","accessory5"];
        if (!validSlots.includes(item.type)) {
            showToast("❌ 装备插槽不合法");
            return;
        }

        // 脱下当前插槽旧装备（独立插槽，不影响其他部位）
        const oldItem = gameData.equipped[item.type];
        if (oldItem) equipments.push(oldItem);

        // 穿戴到对应插槽
        gameData.equipped[item.type] = item;
        equipments.splice(index, 1);

        const slotName = item.type === "rightHand" ? "右手" : item.type === "leftHand" ? "左手" : item.type;
        showToast(`🎽 穿戴【${item.name}】到${slotName}成功！`);
        renderAll();
        saveGame();
    } catch (e) {
        showToast("❌ 穿戴失败");
        console.error(e);
    }
}

function useFood(key) {
    try {
        const food = FOODS[key];
        const bag = gameData.bag;
        if (!food || !bag.foods[key] || bag.foods[key] <= 0) return;
        bag.foods[key]--;
        const total = calculateTotalStats();
        const char = gameData.character;
        char.hp = Math.min(total.hpMax, (char.hp || 0) + food.hp);
        char.mp = Math.min(total.mpMax, (char.mp || 0) + food.mp);
        showToast(`${food.icon} 使用${food.name}成功！`);
        renderAll();
        saveGame();
    } catch (e) {
        showToast("❌ 使用失败");
    }
}

function dropItem(type, key) {
    if (!confirm("确定丢弃？")) return;
    try {
        const bag = gameData.bag;
        switch (type) {
            case "mat": if (bag.materials[key] > 0) bag.materials[key]--; break;
            case "food": if (bag.foods[key] > 0) bag.foods[key]--; break;
            case "equip": bag.equipments.splice(key, 1); break;
        }
        showToast("🗑️ 丢弃成功！");
        renderAll();
        saveGame();
    } catch (e) {
        showToast("❌ 丢弃失败");
    }
}

// ========================== 战斗系统 ==========================
function renderBattle() {
    try {
        const select = document.getElementById("area-select");
        const recordContainer = document.getElementById("battle-record");
        if (!select || !recordContainer) return;
        select.innerHTML = "";
        for (const key in AREAS) {
            const option = document.createElement("option");
            option.value = key;
            option.textContent = `${AREAS[key].icon} ${AREAS[key].name}`;
            option.title = AREAS[key].desc;
            select.appendChild(option);
        }
        select.value = gameData.currentArea || "grassland";
        // 更新区域描述
        const area = AREAS[gameData.currentArea];
        const battleInfo = document.getElementById("battle-info");
        if (battleInfo && area) {
            battleInfo.innerHTML = `<strong>${area.icon} ${area.name}</strong><br><em>${area.desc}</em>`;
        }
        recordContainer.innerHTML = (gameData.battleRecord || []).slice(-10)
            .map(item => `<div>${item}</div>`)
            .join("");
    } catch (e) {
        console.error("战斗界面渲染错误：", e);
    }
}

document.getElementById("area-select")?.addEventListener("change", function() {
    gameData.currentArea = this.value;
    renderAll();
    saveGame();
});

document.getElementById("gather-btn")?.addEventListener("click", () => {
    try {
        const area = gameData.currentArea;
        const materials = AREAS[area]?.gather || [];
        if (materials.length === 0) return;
        let mat = materials[Math.floor(Math.random() * materials.length)];
        let count = Math.floor(Math.random() * 3) + 1;

        // 飾品/套裝：採集事件（可改 mat / count）
        let ctx = triggerAccessoryEvent("gather", {
            area,
            mat,
            count,
            toastSuffix: ""
        });
        ctx = triggerSetEvent("gather", ctx);
        mat = ctx.mat;
        count = ctx.count;

        gameData.bag.materials[mat] = (gameData.bag.materials[mat] || 0) + count;
        const m = MATERIALS[mat];
        showToast(`🌿 采集获得 ${m.icon} ${m.name} x${count}${ctx.toastSuffix || ""}`);
        renderAll();
        saveGame();
    } catch (e) {
        showToast("❌ 采集失败");
    }
});

document.getElementById("battle-btn")?.addEventListener("click", async () => {
    try {
        const area = gameData.currentArea;
        const monsterList = MONSTERS[area] || [];
        if (monsterList.length === 0) { showToast("❌ 此区域无怪物"); return; }
        const enemy = { ...monsterList[Math.floor(Math.random() * monsterList.length)] };
        const char = gameData.character;
        const totalStats = calculateTotalStats();
        const battleInfo = document.getElementById("battle-info");

        // 飾品/套裝：戰鬥開始事件
        const logLines = [];
        const startCtx = { mode: "field", char, total: totalStats, enemy, logLines };
        triggerAccessoryEvent("battleStart", startCtx);
        triggerSetEvent("battleStart", startCtx);

        let log = `🎯 遭遇【${enemy.icon || ""} ${enemy.name}】！\n${enemy.desc || ""}`;
        if (logLines.length) log += `\n${logLines.join("\n")}`;
        gameData.battleRecord.push(`[${new Date().toLocaleTimeString()}] ${log}`);
        battleInfo.innerHTML = log.replace(/\n/g, "<br>");

        while (char.hp > 0 && enemy.hp > 0) {
            await new Promise(resolve => setTimeout(resolve, 800));

            // 玩家出手：可被飾品/套裝改寫 damage
            const playerCtx = { mode: "field", char, total: totalStats, enemy, damage: Math.max(1, totalStats.str - enemy.def), logLines: [] };
            triggerAccessoryEvent("beforePlayerAttack", playerCtx);
            triggerSetEvent("beforePlayerAttack", playerCtx);
            const playerDmg = Math.max(1, Math.floor(playerCtx.damage || 1));
            enemy.hp -= playerDmg;
            const afterPlayerCtx = { mode: "field", char, total: totalStats, enemy, damageDealt: playerDmg, logLines: playerCtx.logLines };
            triggerAccessoryEvent("afterPlayerAttack", afterPlayerCtx);
            triggerSetEvent("afterPlayerAttack", afterPlayerCtx);
            log += `\n你造成${playerDmg}点伤害`;
            if (playerCtx.logLines.length) log += `\n${playerCtx.logLines.join("\n")}`;
            if (enemy.hp > 0) {
                // 敵方出手（先算基礎傷害，再經飾品調整，最後套護盾）
                const baseEnemyDmg = Math.max(1, enemy.str - totalStats.def);
                const enemyCtx = { mode: "field", char, total: totalStats, enemy, damage: baseEnemyDmg, logLines: [] };
                triggerAccessoryEvent("beforeEnemyAttack", enemyCtx);
                triggerSetEvent("beforeEnemyAttack", enemyCtx);
                let enemyDmg = Math.max(0, Math.floor(enemyCtx.damage || 0));

                // 護盾吸收
                if ((char.__shield || 0) > 0 && enemyDmg > 0) {
                    const absorb = Math.min(char.__shield, enemyDmg);
                    char.__shield -= absorb;
                    enemyDmg -= absorb;
                    enemyCtx.logLines.push(addBattleLogLine(`🛡️ 護盾吸收 ${absorb} 伤害（剩余护盾 ${char.__shield}）`));
                }
                char.hp -= enemyDmg;
                const afterEnemyCtx = { mode: "field", char, total: totalStats, enemy, damageDealt: enemyDmg, logLines: enemyCtx.logLines };
                triggerAccessoryEvent("afterEnemyAttack", afterEnemyCtx);
                triggerSetEvent("afterEnemyAttack", afterEnemyCtx);
                log += `\n${enemy.name}造成${enemyDmg}点伤害`;
                if (enemyCtx.logLines.length) log += `\n${enemyCtx.logLines.join("\n")}`;
            }
            battleInfo.innerHTML = log.replace(/\n/g, "<br>");
        }

        if (char.hp <= 0) {
            log += "\n💀 你被击败了！";
            char.hp = 1;
            showToast("💀 战斗失败");
        } else {
            // 勝利事件：允許飾品追加掉落/回復等
            const drops = { ...(enemy.drop || {}) };
            const victoryLines = [];
            const victoryCtx = { mode: "field", char, total: totalStats, enemy, drops, logLines: victoryLines };
            triggerAccessoryEvent("victory", victoryCtx);
            triggerSetEvent("victory", victoryCtx);

            log += `\n🎉 胜利！获得${enemy.exp}经验`;
            char.exp += enemy.exp;
            for (const mat in drops) {
                const cnt = drops[mat];
                gameData.bag.materials[mat] = (gameData.bag.materials[mat] || 0) + cnt;
                const m = MATERIALS[mat];
                log += `\n获得 ${m.icon} ${m.name} x${cnt}`;
            }
            if (victoryLines.length) log += `\n${victoryLines.join("\n")}`;
            checkLevelUp();
            showToast("🎉 战斗胜利");
        }
        gameData.battleRecord.push(`[${new Date().toLocaleTimeString()}] ${log.split("\n").pop()}`);
        battleInfo.innerHTML = log.replace(/\n/g, "<br>");
        renderAll();
        saveGame();
    } catch (e) {
        showToast("❌ 战斗异常");
        console.error(e);
    }
});

function checkLevelUp() {
    const char = gameData.character;
    if (char.exp >= char.expMax) {
        char.exp -= char.expMax;
        char.level++;
        char.expMax = Math.floor(char.expMax * 1.2);
        char.str += 2; char.dex += 2; char.tec += 2; char.def += 2; char.mag += 2;
        char.hpMax += 20; char.hp = char.hpMax;
        char.mpMax += 10; char.mp = char.mpMax;
        showToast(`🎉 等级提升至Lv.${char.level}！`);
    }
}

// ========================== 制作/锻造/强化 ==========================
function renderCraft() {
    const container = document.getElementById("craft-content");
    if (!container) return;
    let html = "";
    for (const id in CRAFT_RECIPES) {
        const recipe = CRAFT_RECIPES[id];
        const food = FOODS[recipe.item];
        if (!food) continue;
        let canCraft = true;
        let matText = "";
        for (const mat in recipe.materials) {
            const need = recipe.materials[mat];
            // 配方材料可以是「素材(materials)」或「食物(foods)」
            if (MATERIALS[mat]) {
                const have = gameData.bag.materials[mat] || 0;
                const m = MATERIALS[mat];
                matText += `${m.icon} ${m.name}:${have}/${need} `;
                if (have < need) canCraft = false;
            } else if (FOODS[mat]) {
                const have = gameData.bag.foods[mat] || 0;
                const f = FOODS[mat];
                matText += `${f.icon} ${f.name}:${have}/${need} `;
                if (have < need) canCraft = false;
            } else {
                // 未定義材料：直接視為不可製作，避免出現 NaN/undefined
                matText += `❓${mat}:0/${need} `;
                canCraft = false;
            }
        }
        html += `
            <div class="beauty-card">
                <h3>${food.icon} ${food.name}</h3>
                <p class="item-desc">${food.desc}</p>
                <p>${matText}</p>
                <button ${canCraft ? "" : "disabled"} onclick="craftItem('${id}')">制作</button>
            </div>
        `;
    }
    container.innerHTML = html || "<p>暂无制作配方</p>";
}

function craftItem(id) {
    try {
        const recipe = CRAFT_RECIPES[id];
        // 先檢查是否足夠，避免扣到負數
        for (const mat in recipe.materials) {
            const need = recipe.materials[mat];
            if (MATERIALS[mat]) {
                const have = gameData.bag.materials[mat] || 0;
                if (have < need) { showToast("❌ 材料不足"); return; }
            } else if (FOODS[mat]) {
                const have = gameData.bag.foods[mat] || 0;
                if (have < need) { showToast("❌ 材料不足"); return; }
            } else {
                showToast("❌ 配方材料未定义");
                return;
            }
        }

        // 再統一扣除
        for (const mat in recipe.materials) {
            const need = recipe.materials[mat];
            if (MATERIALS[mat]) {
                gameData.bag.materials[mat] -= need;
            } else if (FOODS[mat]) {
                gameData.bag.foods[mat] -= need;
            }
        }
        gameData.bag.foods[recipe.item] = (gameData.bag.foods[recipe.item] || 0) + 1;
        const food = FOODS[recipe.item];
        showToast(`✅ 制作 ${food.icon} ${food.name} 成功！`);
        renderAll();
        saveGame();
    } catch (e) {
        showToast("❌ 制作失败");
    }
}

function renderForge() {
    const container = document.getElementById("forge-content");
    if (!container) return;
    initFilterUIIfNeeded();

    // 依套裝分組 + 篩選
    const forgeLv = gameData.character.forgeLevel || 1;
    const filter = uiState.forgeFilter;

    // container 原本是 beauty-grid，這裡改用「分組列表」展示
    container.classList.remove("beauty-grid");

    const groups = new Map(); // key: setId|null -> items[]
    for (const id in FORGE_RECIPES) {
        const recipe = FORGE_RECIPES[id];
        const equip = EQUIPMENTS[id];
        if (!equip) continue;
        if ((recipe?.level || 1) > forgeLv) continue;

        const setId = equip.setId || null;
        const slotGroup = getSlotGroup(equip.type);

        // 套裝篩選
        if (filter.setId !== "all") {
            if (filter.setId === "none" && setId) continue;
            if (filter.setId !== "none" && setId !== filter.setId) continue;
        }
        // 等級篩選（配方等級）
        if (filter.level !== "all") {
            if (String(recipe.level) !== String(filter.level)) continue;
        }
        // 部位篩選
        if (filter.slot !== "all") {
            if (slotGroup !== filter.slot) continue;
        }
        // 只顯示可鍛造
        if (filter.craftableOnly) {
            if (!isForgeRecipeCraftable(recipe)) continue;
        }

        if (!groups.has(setId)) groups.set(setId, []);
        groups.get(setId).push({ id, recipe, equip, slotGroup });
    }

    const groupKeys = Array.from(groups.keys());
    groupKeys.sort((a, b) => {
        // 無套裝放最後，其他依名稱排序
        if (!a && b) return 1;
        if (a && !b) return -1;
        const an = getSetName(a);
        const bn = getSetName(b);
        return an.localeCompare(bn, "zh-Hant");
    });

    let html = "";
    for (const setId of groupKeys) {
        const list = groups.get(setId) || [];
        // 每組內：部位 -> 名稱排序（讓呈現更穩定）
        list.sort((x, y) => {
            const s = String(x.slotGroup).localeCompare(String(y.slotGroup));
            if (s !== 0) return s;
            return String(x.equip.name).localeCompare(String(y.equip.name), "zh-Hant");
        });

        const setTitle = setId ? getSetName(setId) : "無套裝";
        const setMeta = setId
            ? (() => {
                const def = SETS?.[setId];
                const two = def?.bonuses?.[2]?.desc;
                const four = def?.bonuses?.[4]?.desc;
                const parts = [two, four].filter(Boolean);
                return parts.length ? `套裝效果：${parts.join(" / ")}` : "";
            })()
            : "";

        html += `<div class="set-group">`;
        html += `<div class="set-group__title"><h3>${setTitle}</h3>${setMeta ? `<span class="set-group__meta">${setMeta}</span>` : ""}</div>`;
        html += `<div class="beauty-grid forge-grid">`;

        for (const it of list) {
            const { id, recipe, equip } = it;
            const slotLabel = SLOT_LABELS[getSlotGroup(equip.type)] || (equip.type || "");
            let matHtml = "";
            for (const mat in recipe.materials) {
                const have = gameData.bag.materials[mat] || 0;
                const need = recipe.materials[mat];
                const m = MATERIALS[mat];
                const label = m ? `${m.icon} ${m.name}` : `❓${mat}`;
                matHtml += `<span class="mat">${label}: ${have}/${need}</span>`;
            }
            const canForge = isForgeRecipeCraftable(recipe);
            html += `
                <div class="beauty-card compact">
                    <h3>${equip.icon} ${equip.name} <small>(${slotLabel} / 配方Lv.${recipe.level})</small></h3>
                    <p class="item-desc">${equip.desc}</p>
                    <div class="forge-stats">属性：⚔️力量+${equip.str} 🛡️防御+${equip.def} ❤️生命+${equip.hp} 💙魔力+${equip.mp}</div>
                    <div class="forge-mats">消耗材料：${matHtml}</div>
                    <button class="ui-btn" ${canForge ? "" : "disabled"} onclick="forgeItem('${id}')">锻造</button>
                </div>
            `;
        }

        html += `</div></div>`;
    }

    container.innerHTML = html || `<p>暂无锻造配方</p>`;
}

function forgeItem(id) {
    try {
        const recipe = FORGE_RECIPES[id];
        const equip = EQUIPMENTS[id];
        for (const mat in recipe.materials) {
            gameData.bag.materials[mat] -= recipe.materials[mat];
        }
        // 统一用实例生成函数，确保强化成长规则一致
        const instance = createEquipmentInstance(id, 1);
        if (instance) gameData.bag.equipments.push(instance);
        gameData.character.forgeExp += 5;
        if (gameData.character.forgeExp >= gameData.character.forgeExpMax) {
            gameData.character.forgeExp = 0;
            gameData.character.forgeLevel++;
            showToast(`⚒️ 锻造等级提升！`);
        }
        showToast(`✅ 锻造 ${equip.icon} ${equip.name} 成功！`);
        renderAll();
        saveGame();
    } catch (e) {
        showToast("❌ 锻造失败");
    }
}

function renderEnhance() {
    const container = document.getElementById("enhance-content");
    if (!container) return;
    let html = "";
    const equipments = gameData.bag.equipments || [];

    // 以「同ID + 同等级」做强化分组：2件同等级 -> 1件升级
    const groups = new Map(); // key: `${id}__${level}`
    for (const it of equipments) {
        if (!it?.id) continue;
        const lv = Math.max(1, Number(it.level) || 1);
        const key = `${it.id}__${lv}`;
        groups.set(key, (groups.get(key) || 0) + 1);
    }

    for (const [key, count] of groups.entries()) {
        if (count < 2) continue;
        const [id, lvStr] = key.split("__");
        const lv = Number(lvStr) || 1;
        const equip = EQUIPMENTS[id];
        if (!equip) continue;
        const next = createEquipmentInstance(id, lv + 1);
        html += `
            <div class="beauty-card">
                <h3>${equip.icon} ${equip.name} <small>[+${lv}] → [+${lv + 1}]</small></h3>
                <p class="item-desc">${equip.desc}</p>
                <p>数量：${count}（需要2件同等级）</p>
                <p>强化后：⚔️${next?.str ?? 0} 🛡️${next?.def ?? 0} ❤️${next?.hp ?? 0} 💙${next?.mp ?? 0}</p>
                <button onclick="enhanceItem('${id}', ${lv})">强化</button>
            </div>
        `;
    }
    container.innerHTML = html || "<p>无可强化装备</p>";
}

function enhanceItem(id, level) {
    try {
        const targetLv = Math.max(1, Number(level) || 1);
        const bagList = gameData.bag.equipments || [];

        // 找出同ID且同等级的两件（只消耗两件，不会一口气吃光）
        const idxs = [];
        for (let i = 0; i < bagList.length; i++) {
            const it = bagList[i];
            const lv = Math.max(1, Number(it?.level) || 1);
            if (it?.id === id && lv === targetLv) idxs.push(i);
            if (idxs.length >= 2) break;
        }
        if (idxs.length < 2) {
            showToast("❌ 同等级装备不足2件，无法强化");
            return;
        }

        // 从后往前删除，避免索引位移
        idxs.sort((a, b) => b - a).forEach(i => bagList.splice(i, 1));

        const newItem = createEquipmentInstance(id, targetLv + 1);
        if (!newItem) {
            showToast("❌ 装备模板不存在，无法强化");
            return;
        }
        bagList.push(newItem);

        showToast(`✨ 强化成功！${newItem.icon || ""} ${newItem.name}+${newItem.level}`);
        renderAll();
        saveGame();
    } catch (e) {
        showToast("❌ 强化失败");
    }
}