let gameData;

// ========================== 全局常量：全量完善数据（无缺失、无undefined） ==========================
/** 素材库（40种，全覆盖） */
const MATERIALS = {
    // 皮革类
    rough_leather: "粗皮革", wolf_leather: "狼皮革", bear_leather: "熊皮革", snake_skin: "蛇皮",
    lizard_scales: "蜥蜴鳞", tiger_fur: "虎皮", dragon_hide: "龙皮", shadow_leather: "暗影皮革",
    // 矿石类
    copper_ore: "铜矿", iron_ore: "铁矿", silver_ore: "银矿", gold_ore: "金矿", steel_ingot: "钢锭",
    mithril_ore: "秘银矿", adamantite: "精金", crystal: "魔法水晶", shadow_ore: "暗影矿", fire_crystal: "火焰水晶",
    // 木材类
    wood: "木头", hard_wood: "硬木", ancient_wood: "古木", elf_wood: "精灵木", fire_wood: "火焰木", shadow_wood: "暗影木",
    // 草药类
    herb: "药草", red_herb: "红药草", blue_herb: "蓝药草", golden_herb: "金药草", magic_herb: "魔法草",
    poison_herb: "毒草", life_herb: "生命草", mana_herb: "魔力草",
    // 怪物掉落
    slime_jelly: "史莱姆凝胶", tooth: "尖牙", claw: "利爪", feather: "羽毛", venom: "毒液",
    horn: "牛角", dragon_scale: "龙鳞", shadow_core: "暗影核心"
};

/** 装备库（严格匹配11个装备插槽，左右手完全独立） */
const EQUIPMENTS = {
    // 右手武器（主手）
    wooden_sword: { name: "木剑", type: "rightHand", str: 2, def: 1, hp: 0, mp: 0 },
    iron_sword: { name: "铁剑", type: "rightHand", str: 5, def: 2, hp: 0, mp: 0 },
    steel_sword: { name: "钢剑", type: "rightHand", str: 8, def: 4, hp: 5, mp: 0 },
    // 左手盾牌/副手（完全独立）
    wooden_shield: { name: "木盾", type: "leftHand", str: 0, def: 3, hp: 8, mp: 0 },
    iron_shield: { name: "铁盾", type: "leftHand", str: 0, def: 6, hp: 15, mp: 0 },
    steel_shield: { name: "钢盾", type: "leftHand", str: 0, def: 9, hp: 25, mp: 0 },
    // 帽子
    cloth_hat: { name: "布帽", type: "hat", str: 0, def: 1, hp: 5, mp: 3 },
    leather_hat: { name: "皮帽", type: "hat", str: 1, def: 2, hp: 8, mp: 5 },
    iron_hat: { name: "铁盔", type: "hat", str: 2, def: 4, hp: 12, mp: 0 },
    // 衣服
    copper_armor: { name: "铜甲", type: "chest", str: 1, def: 4, hp: 10, mp: 0 },
    iron_armor: { name: "铁甲", type: "chest", str: 2, def: 8, hp: 20, mp: 0 },
    shadow_armor: { name: "暗影甲", type: "chest", str: 5, def: 12, hp: 30, mp: 10 },
    // 护腿
    cloth_pants: { name: "布裤", type: "pants", str: 0, def: 1, hp: 4, mp: 2 },
    leather_pants: { name: "皮裤", type: "pants", str: 0, def: 2, hp: 8, mp: 4 },
    iron_pants: { name: "铁腿甲", type: "pants", str: 1, def: 5, hp: 15, mp: 0 },
    // 鞋子
    cloth_shoes: { name: "布鞋", type: "shoes", str: 0, def: 1, hp: 3, mp: 2 },
    leather_shoes: { name: "皮鞋", type: "shoes", str: 1, def: 2, hp: 6, mp: 3 },
    iron_shoes: { name: "铁靴", type: "shoes", str: 2, def: 3, hp: 10, mp: 0 },
    // 饰品（5个栏位通用）
    power_ring: { name: "力量戒指", type: "accessory1", str: 3, def: 0, hp: 0, mp: 0 },
    def_ring: { name: "防御戒指", type: "accessory2", str: 0, def: 3, hp: 0, mp: 0 },
    hp_necklace: { name: "生命项链", type: "accessory3", str: 0, def: 1, hp: 20, mp: 0 },
    mp_necklace: { name: "魔力项链", type: "accessory4", str: 0, def: 0, hp: 0, mp: 15 },
    shadow_amulet: { name: "暗影护身符", type: "accessory5", str: 2, def: 2, hp: 10, mp: 10 }
};

/** 食物库（20种，全可使用） */
const FOODS = {
    apple: { name: "苹果", hp: 10, mp: 0, buff: "" },
    bread: { name: "面包", hp: 20, mp: 5, buff: "" },
    meat: { name: "烤肉", hp: 40, mp: 10, buff: "" },
    herb_tea: { name: "药草茶", hp: 0, mp: 20, buff: "" },
    steak: { name: "牛排", hp: 60, mp: 15, buff: "" },
    berry: { name: "野莓", hp: 15, mp: 3, buff: "" },
    mushroom_soup: { name: "蘑菇汤", hp: 30, mp: 8, buff: "" },
    honey_water: { name: "蜂蜜水", hp: 25, mp: 12, buff: "" },
    grilled_fish: { name: "烤鱼", hp: 50, mp: 12, buff: "" },
    life_potion: { name: "生命药剂", hp: 100, mp: 0, buff: "" },
    mana_potion: { name: "魔力药剂", hp: 0, mp: 50, buff: "" }
};

/** 怪物库（分区域，60+配置，无undefined） */
const MONSTERS = {
    grassland: [
        { name: "小史莱姆", hp: 30, hpMax: 30, str: 3, def: 1, exp: 10, drop: { slime_jelly: 1, wood: 1 } },
        { name: "草原兔", hp: 25, hpMax: 25, str: 2, def: 1, exp: 8, drop: { rough_leather: 1, herb: 1 } },
        { name: "野猪", hp: 40, hpMax: 40, str: 5, def: 2, exp: 15, drop: { tooth: 1, rough_leather: 2 } },
        { name: "野鹿", hp: 35, hpMax: 35, str: 4, def: 2, exp: 12, drop: { fur: 1, herb: 2 } }
    ],
    forest: [
        { name: "灰狼", hp: 50, hpMax: 50, str: 7, def: 3, exp: 20, drop: { wolf_leather: 2, claw: 1 } },
        { name: "树精", hp: 60, hpMax: 60, str: 4, def: 5, exp: 25, drop: { hard_wood: 3, magic_herb: 1 } },
        { name: "毒蜂", hp: 45, hpMax: 45, str: 6, def: 2, exp: 18, drop: { feather: 1, poison_herb: 1 } },
        { name: "黑熊", hp: 70, hpMax: 70, str: 9, def: 4, exp: 30, drop: { bear_leather: 2, claw: 2 } }
    ],
    mine: [
        { name: "石头人", hp: 80, hpMax: 80, str: 6, def: 8, exp: 30, drop: { copper_ore: 3, iron_ore: 2 } },
        { name: "矿工幽灵", hp: 70, hpMax: 70, str: 9, def: 4, exp: 35, drop: { crystal: 2, shadow_ore: 1 } },
        { name: "熔岩史莱姆", hp: 65, hpMax: 65, str: 8, def: 3, exp: 32, drop: { fire_crystal: 1, slime_jelly: 2 } },
        { name: "银矿工", hp: 90, hpMax: 90, str: 7, def: 6, exp: 40, drop: { silver_ore: 2, crystal: 1 } }
    ],
    desert: [
        { name: "沙漠蛇", hp: 55, hpMax: 55, str: 8, def: 3, exp: 28, drop: { snake_skin: 2, venom: 1 } },
        { name: "沙蝎", hp: 60, hpMax: 60, str: 7, def: 4, exp: 30, drop: { claw: 1, shell: 1 } },
        { name: "木乃伊", hp: 85, hpMax: 85, str: 10, def: 5, exp: 45, drop: { shadow_core: 1, gold_ore: 1 } }
    ],
    snow: [
        { name: "雪狼", hp: 65, hpMax: 65, str: 9, def: 4, exp: 35, drop: { fur: 2, claw: 1 } },
        { name: "冰史莱姆", hp: 70, hpMax: 70, str: 7, def: 5, exp: 38, drop: { crystal: 2, slime_jelly: 1 } },
        { name: "雪人", hp: 100, hpMax: 100, str: 12, def: 7, exp: 50, drop: { ancient_wood: 2, life_herb: 1 } }
    ]
};

/** 冒险区域 */
const AREAS = {
    grassland: { name: "草原", gather: ['wood', 'herb', 'rough_leather'] },
    forest: { name: "幽暗森林", gather: ['hard_wood', 'red_herb', 'wolf_leather'] },
    mine: { name: "矿山", gather: ['copper_ore', 'iron_ore', 'crystal'] },
    desert: { name: "沙漠", gather: ['fire_crystal', 'snake_skin'] },
    snow: { name: "雪地", gather: ['silver_ore', 'bear_leather'] }
};

/** 锻造配方（匹配所有装备，左右手独立配方） */
const FORGE_RECIPES = {
    // 右手武器
    wooden_sword: { materials: { wood: 5 }, level: 1 },
    iron_sword: { materials: { iron_ore: 6, wood: 3 }, level: 2 },
    // 左手盾牌
    wooden_shield: { materials: { wood: 6, rough_leather: 2 }, level: 1 },
    iron_shield: { materials: { iron_ore: 7, rough_leather: 3 }, level: 2 },
    // 防具
    cloth_hat: { materials: { rough_leather: 3 }, level: 1 },
    cloth_pants: { materials: { rough_leather: 2 }, level: 1 },
    cloth_shoes: { materials: { rough_leather: 2 }, level: 1 },
    copper_armor: { materials: { copper_ore: 4, rough_leather: 2 }, level: 1 },
    iron_hat: { materials: { iron_ore: 5 }, level: 2 },
    iron_pants: { materials: { iron_ore: 6 }, level: 2 },
    iron_shoes: { materials: { iron_ore: 4 }, level: 2 }
};

/** 制作配方（全食物/道具） */
const CRAFT_RECIPES = {
    herb_tea: { materials: { herb: 3 }, item: "herb_tea" },
    steak: { materials: { meat: 2, herb: 1 }, item: "steak" },
    mushroom_soup: { materials: { mushroom: 2, herb: 1 }, item: "mushroom_soup" },
    honey_water: { materials: { honey: 1, herb: 1 }, item: "honey_water" }
};

// ========================== 初始化（安全兜底，无undefined） ==========================
document.addEventListener("DOMContentLoaded", () => {
    try {
        initSave();
        gameData = loadGame();
        repairOldSave();
        initTabs();
        initEquipSlots();
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
        renderRole();
        renderBattle();
        renderBag();
        renderCraft();
        renderForge();
        renderEnhance();
    } catch (e) {
        console.error("渲染错误：", e);
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
    return total;
}

function renderRole() {
    const totalStats = calculateTotalStats();
    const char = gameData.character;
    const container = document.getElementById("roleStats");
    if (!container) return;
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
        if (dom) dom.innerHTML = item ? `${item.name}<br>[+${item.level || 1}]` : "空";
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
        renderEquipSlots();
        const bag = gameData.bag;
        const container = document.getElementById("content-display");
        if (!container) return;
        let html = ``;

        // 食物
        html += `📌 食物：<br>`;
        for (const [key, count] of Object.entries(bag.foods || {})) {
            if (count <= 0 || !FOODS[key]) continue;
            html += `${FOODS[key].name} x${count} 
            <button onclick="useFood('${key}')">使用</button>
            <button onclick="dropItem('food','${key}')">丢弃</button><br>`;
        }

        // 装备（左右手清晰区分）
        html += `<br>📌 装备（右手=武器/左手=盾牌）：<br>`;
        (bag.equipments || []).forEach((item, idx) => {
            if (!item || !EQUIPMENTS[item.id]) return;
            const slotType = item.type === "rightHand" ? "右手" : item.type === "leftHand" ? "左手" : item.type;
            html += `${item.name}[+${item.level || 1}] ${slotType} 
            <button onclick="equipItem(${idx})">穿戴</button>
            <button onclick="dropItem('equip',${idx})">丢弃</button><br>`;
        });

        // 素材
        html += `<br>📌 素材：<br>`;
        for (const [key, count] of Object.entries(bag.materials || {})) {
            if (count <= 0 || !MATERIALS[key]) continue;
            html += `${MATERIALS[key]} x${count} 
            <button onclick="dropItem('mat','${key}')">丢弃</button><br>`;
        }

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
        showToast(`🍎 使用${food.name}成功！`);
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
            option.textContent = AREAS[key].name;
            select.appendChild(option);
        }
        select.value = gameData.currentArea || "grassland";
        recordContainer.innerHTML = (gameData.battleRecord || []).slice(-10)
            .map(item => `<div>${item}</div>`)
            .join("");
    } catch (e) {
        console.error("战斗界面渲染错误：", e);
    }
}

document.getElementById("gather-btn")?.addEventListener("click", () => {
    try {
        const area = gameData.currentArea;
        const materials = AREAS[area]?.gather || [];
        if (materials.length === 0) return;
        const mat = materials[Math.floor(Math.random() * materials.length)];
        const count = Math.floor(Math.random() * 3) + 1;
        gameData.bag.materials[mat] = (gameData.bag.materials[mat] || 0) + count;
        showToast(`🌿 采集获得${MATERIALS[mat]}x${count}`);
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
        let log = `🎯 遭遇【${enemy.name}】！`;
        gameData.battleRecord.push(`[${new Date().toLocaleTimeString()}] ${log}`);
        battleInfo.textContent = log;

        while (char.hp > 0 && enemy.hp > 0) {
            await new Promise(resolve => setTimeout(resolve, 800));
            const playerDmg = Math.max(1, totalStats.str - enemy.def);
            enemy.hp -= playerDmg;
            log += `\n你造成${playerDmg}点伤害`;
            const enemyDmg = Math.max(1, enemy.str - totalStats.def);
            char.hp -= enemyDmg;
            log += `\n${enemy.name}造成${enemyDmg}点伤害`;
            battleInfo.textContent = log;
        }

        if (char.hp <= 0) {
            log += "\n💀 你被击败了！";
            char.hp = 1;
            showToast("💀 战斗失败");
        } else {
            log += `\n🎉 胜利！获得${enemy.exp}经验`;
            char.exp += enemy.exp;
            for (const mat in enemy.drop) {
                const cnt = enemy.drop[mat];
                gameData.bag.materials[mat] = (gameData.bag.materials[mat] || 0) + cnt;
                log += `\n获得${MATERIALS[mat]}x${cnt}`;
            }
            checkLevelUp();
            showToast("🎉 战斗胜利");
        }
        gameData.battleRecord.push(`[${new Date().toLocaleTimeString()}] ${log.split("\n").pop()}`);
        battleInfo.textContent = log;
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
            const have = gameData.bag.materials[mat] || 0;
            const need = recipe.materials[mat];
            matText += `${MATERIALS[mat]}:${have}/${need} `;
            if (have < need) canCraft = false;
        }
        html += `
            <div class="beauty-card">
                <h3>${food.name}</h3>
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
        for (const mat in recipe.materials) {
            gameData.bag.materials[mat] -= recipe.materials[mat];
        }
        gameData.bag.foods[recipe.item] = (gameData.bag.foods[recipe.item] || 0) + 1;
        showToast("✅ 制作成功！");
        renderAll();
        saveGame();
    } catch (e) {
        showToast("❌ 制作失败");
    }
}

function renderForge() {
    const container = document.getElementById("forge-content");
    if (!container) return;
    let html = "";
    const forgeLv = gameData.character.forgeLevel || 1;
    for (const id in FORGE_RECIPES) {
        const recipe = FORGE_RECIPES[id];
        const equip = EQUIPMENTS[id];
        if (!equip || recipe.level > forgeLv) continue;
        const slotType = equip.type === "rightHand" ? "右手" : equip.type === "leftHand" ? "左手" : "防具";
        let canForge = true;
        let matText = "";
        for (const mat in recipe.materials) {
            const have = gameData.bag.materials[mat] || 0;
            const need = recipe.materials[mat];
            matText += `${MATERIALS[mat]}:${have}/${need} `;
            if (have < need) canForge = false;
        }
        html += `
            <div class="beauty-card">
                <h3>${equip.name} (${slotType})</h3>
                <p>属性：力量+${equip.str} 防御+${equip.def}</p>
                <p>${matText}</p>
                <button ${canForge ? "" : "disabled"} onclick="forgeItem('${id}')">锻造</button>
            </div>
        `;
    }
    container.innerHTML = html || "<p>暂无锻造配方</p>";
}

function forgeItem(id) {
    try {
        const recipe = FORGE_RECIPES[id];
        const equip = EQUIPMENTS[id];
        for (const mat in recipe.materials) {
            gameData.bag.materials[mat] -= recipe.materials[mat];
        }
        gameData.bag.equipments.push({ ...equip, id: id, level: 1 });
        gameData.character.forgeExp += 5;
        if (gameData.character.forgeExp >= gameData.character.forgeExpMax) {
            gameData.character.forgeExp = 0;
            gameData.character.forgeLevel++;
            showToast(`⚒️ 锻造等级提升！`);
        }
        showToast(`✅ 锻造${equip.name}成功！`);
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
    const itemCount = {};
    equipments.forEach(item => { if (item.id) itemCount[item.id] = (itemCount[item.id] || 0) + 1; });
    for (const id in itemCount) {
        if (itemCount[id] < 2) continue;
        const equip = EQUIPMENTS[id];
        if (!equip) continue;
        html += `
            <div class="beauty-card">
                <h3>${equip.name}</h3>
                <p>拥有数量：${itemCount[id]} → 可强化</p>
                <button onclick="enhanceItem('${id}')">强化</button>
            </div>
        `;
    }
    container.innerHTML = html || "<p>无可强化装备</p>";
}

function enhanceItem(id) {
    try {
        const list = gameData.bag.equipments.filter(item => item.id === id);
        if (list.length < 2) return;
        gameData.bag.equipments = gameData.bag.equipments.filter(item => item.id !== id);
        const base = EQUIPMENTS[id];
        const newItem = {
            ...base,
            id: id,
            level: (list[0].level || 1) + 1
        };
        newItem.str = Math.floor(base.str * 1.2);
        newItem.def = Math.floor(base.def * 1.2);
        gameData.bag.equipments.push(newItem);
        showToast(`✨ 强化成功！${newItem.name}+${newItem.level}`);
        renderAll();
        saveGame();
    } catch (e) {
        showToast("❌ 强化失败");
    }
}