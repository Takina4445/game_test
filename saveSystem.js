// 存檔鍵
const SAVE_KEY = "RPG_GAME_SAVE";

// 初始化存檔
function initSave() {
    if (!localStorage.getItem(SAVE_KEY)) {
        const defaultData = getDefaultGameData();
        localStorage.setItem(SAVE_KEY, JSON.stringify(defaultData));
    }
}

// 儲存遊戲
function saveGame() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(gameData));
}

// 讀取存檔
function loadGame() {
    return JSON.parse(localStorage.getItem(SAVE_KEY));
}

// 預設資料（兼容所有版本）
function getDefaultGameData() {
    return {
        character: {
            level: 1, exp: 0, expMax: 100,
            hp: 100, hpMax: 100, mp: 50, mpMax: 50,
            str: 5, dex: 5, tec: 5, def: 5, mag: 5,
            forgeLevel: 1, forgeExp: 0, forgeExpMax: 50
        },
        bag: {
            materials: { wood:10, herb:8, rough_leather:5, copper_ore:4, iron_ore:2 },
            equipments: [
                { id:"wooden_sword", name:"木劍", type:"rightHand", str:2, def:1, level:1 }
            ],
            foods: { apple:5, bread:3, meat:2, stamina_jerky:1, antidote:1 },
            blueprints: ["wooden_sword","copper_armor","iron_sword"]
        },
        currentArea: "grassland",
        // 擴充裝備欄：11個欄位
        equipped: {
            rightHand:null, leftHand:null, hat:null, chest:null,
            pants:null, shoes:null,
            accessory1:null, accessory2:null, accessory3:null, accessory4:null, accessory5:null
        },
        battleRecord: [],
        dungeon: {
            floor: 1,
            bestFloor: 1,
            record: []
        },
        worldboss: {
            // 已通關的四天王（用 set 存 id，便於擴充）
            cleared: [],
            // 世界BOSS戰鬥紀錄（顯示於世界BOSS頁右側）
            record: []
        },
        log: []
    };
}