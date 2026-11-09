const Menu = require("../models/Menu");

const weekdayMenus = {
  0: {
    breakfast: { veg: ["Chakuli", "Khuda Upma", "Ghuguni"], nonVeg: [] },
    lunch: {
      veg: ["Rice", "Dal", "Roti", "Kabuli Paneer", "Green Salad"],
      nonVeg: ["Fish Masala"],
    },
    teaTime: { veg: ["Coffee", "Marie Biscuits"], nonVeg: [] },
    dinner: {
      veg: ["Veg Biryani", "Raita", "Mushroom Masala"],
      nonVeg: ["Chicken Kasa"],
    },
  },
  1: {
    breakfast: { veg: ["Roti", "Buta Aloo Curry"], nonVeg: [] },
    lunch: {
      veg: ["Rice", "Dal", "Veg Curry", "Tomato Besara", "Friems"],
      nonVeg: [],
    },
    teaTime: { veg: ["Tea", "Rusk"], nonVeg: [] },
    dinner: {
      veg: ["Rice", "Dal", "Roti", "Matar Paneer", "Kheer"],
      nonVeg: [],
    },
  },
  2: {
    breakfast: { veg: ["Veg Chowmin", "Manchurian Gravy"], nonVeg: [] },
    lunch: {
      veg: ["Rice", "Dal", "Roti", "Sambar", "Veg Korma", "Aloo Bharta"],
      nonVeg: [],
    },
    teaTime: { veg: ["Tea", "Salt Biscuits"], nonVeg: [] },
    dinner: {
      veg: ["Zeera Rice", "Dal Fry", "Roti", "Veg Curry"],
      nonVeg: ["Egg Bhurji"],
    },
  },
  3: {
    breakfast: { veg: ["Roti", "Aloo Matar Curry"], nonVeg: [] },
    lunch: {
      veg: ["Rice", "Dal", "Veg Fry", "Potola Masala"],
      nonVeg: ["Fish Besara"],
    },
    teaTime: { veg: ["Coffee", "Sweet and Salt Biscuits"], nonVeg: [] },
    dinner: {
      veg: ["Rice", "Dal Fry", "Roti", "Mushroom Chilli"],
      nonVeg: ["Chilli Chicken"],
    },
  },
  4: {
    breakfast: { veg: ["Idli", "Chutney", "Sambar"], nonVeg: [] },
    lunch: {
      veg: ["Rice", "Dal", "Roti", "Soya Masala", "Ambula Rai", "Friems"],
      nonVeg: ["Egg Masala"],
    },
    teaTime: { veg: ["Tea", "Marie Biscuits"], nonVeg: [] },
    dinner: {
      veg: ["Lemon Rice", "Rice", "Dal", "Roti", "Kabuli Do-Piaza", "Sweet"],
      nonVeg: [],
    },
  },
  5: {
    breakfast: { veg: ["Roti", "Chuni Chuni Aloo Bhaja"], nonVeg: [] },
    lunch: {
      veg: ["Rice", "Dal", "Veg Fry", "Pakodi Curry", "Ambula Rai"],
      nonVeg: ["Fish Masala"],
    },
    teaTime: { veg: ["Tea", "Rusk"], nonVeg: [] },
    dinner: {
      veg: ["Rice", "Dal", "Roti", "Paneer Butter Masala"],
      nonVeg: ["Chicken Butter Masala"],
    },
  },
  6: {
    breakfast: { veg: [], nonVeg: [] },
    lunch: { veg: [], nonVeg: [] },
    teaTime: { veg: [], nonVeg: [] },
    dinner: { veg: [], nonVeg: [] },
  },
};

const novemberWeekdayMenus = {
  0: {
    breakfast: { veg: ["Chakuli", "Khuda Upma", "Ghuguni"], nonVeg: [] },
    lunch: {
      veg: ["Rice", "Dal", "Rasam", "Roti", "Kabuli Paneer", "Green Salad"],
      nonVeg: ["Fish Masala"],
    },
    teaTime: { veg: ["Coffee", "Marie Biscuits"], nonVeg: [] },
    dinner: {
      veg: ["Veg Biryani", "Raita", "Mushroom Masala"],
      nonVeg: ["Chicken Kasa"],
    },
  },
  1: {
    breakfast: { veg: ["Poha", "Aloo Matar Curry"], nonVeg: [] },
    lunch: { veg: ["Rice", "Dal", "Dalma", "Veg Curry", "Fryums"], nonVeg: [] },
    teaTime: { veg: ["Tea", "Rusk"], nonVeg: [] },
    dinner: { veg: ["Rice", "Dal", "Roti", "Matar Paneer", "Guji Chana Bhaja"], nonVeg: [] },
  },
  2: {
    breakfast: { veg: ["Veg Chowmin", "Manchurian Gravy"], nonVeg: [] },
    lunch: { veg: ["Rice", "Dal", "Roti", "Sambar", "Veg Korma", "Aloo Bharta"], nonVeg: [] },
    teaTime: { veg: ["Tea", "Salt Biscuits"], nonVeg: [] },
    dinner: { veg: ["Zeera Rice", "Dal", "Roti", "Veg Tadka", "Kheer"], nonVeg: ["Egg Tadka"] },
  },
  3: {
    breakfast: { veg: ["Roti", "Buta Aloo Curry"], nonVeg: [] },
    lunch: { veg: ["Rice", "Dal", "Veg Fry", "Potola Masala"], nonVeg: ["Fish Besara"] },
    teaTime: { veg: ["Coffee", "Sweet and Salt Biscuits"], nonVeg: [] },
    dinner: { veg: ["Rice", "Dal Fry", "Roti", "Mushroom Chilli"], nonVeg: ["Chilli Chicken"] },
  },
  4: {
    breakfast: { veg: ["Idli", "Chutney", "Sambar"], nonVeg: [] },
    lunch: { veg: ["Rice", "Dal", "Roti", "Soya Masala", "Ambula Rai", "Fryums"], nonVeg: ["Egg Masala"] },
    teaTime: { veg: ["Tea", "Marie Biscuits"], nonVeg: [] },
    dinner: { veg: ["Lemon Rice", "Rice", "Dal", "Roti", "Kabuli Do-Piaza", "Sweet"], nonVeg: [] },
  },
  5: {
    breakfast: { veg: ["Roti", "Chuni Chuni Aloo Bhaja"], nonVeg: [] },
    lunch: { veg: ["Rice", "Dal", "Veg Fry", "Cauliflower and Green Peas Curry"], nonVeg: ["Fish Masala"] },
    teaTime: { veg: ["Tea", "Rusk"], nonVeg: [] },
    dinner: { veg: ["Rice", "Dal", "Rasam", "Roti", "Paneer Butter Masala"], nonVeg: ["Chicken Butter Masala"] },
  },
  6: {
    breakfast: { veg: ["Dahibara Aloo Dum", "Ghuguni Chaat"], nonVeg: [] },
    lunch: { veg: ["Rice", "Dal", "Roti", "Soya Chilli", "Khatta"], nonVeg: ["Egg Chilli"] },
    teaTime: { veg: ["Coffee", "Sweet and Salt Biscuits"], nonVeg: [] },
    dinner: { veg: ["Fried Rice", "Roti", "Dal", "Guguni", "Semiya Khiri"], nonVeg: [] },
  },
};

function buildOfficialOctoberMenus() {
  const menus = [];
  for (let day = 1; day <= 31; day += 1) {
    const date = `2026-10-${String(day).padStart(2, "0")}`;
    const weekday = new Date(Date.UTC(2026, 9, day)).getUTCDay();
    menus.push({
      date,
      isHoliday: date === "2026-10-02",
      ...weekdayMenus[weekday],
    });
  }
  return menus;
}

async function seedOfficialOctoberMenus() {
  const menus = buildOfficialOctoberMenus();
  await Menu.bulkWrite(
    menus.map((menu) => ({
      updateOne: {
        filter: { date: menu.date },
        update: { $setOnInsert: menu },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}

function buildOfficialNovemberMenus() {
  const menus = [];
  for (let day = 1; day <= 30; day += 1) {
    const date = `2026-11-${String(day).padStart(2, "0")}`;
    const weekday = new Date(Date.UTC(2026, 10, day)).getUTCDay();
    menus.push({ date, ...novemberWeekdayMenus[weekday] });
  }
  return menus;
}

async function seedOfficialNovemberMenus() {
  const menus = buildOfficialNovemberMenus();
  await Menu.bulkWrite(
    menus.map((menu) => ({
      updateOne: {
        filter: { date: menu.date },
        update: { $setOnInsert: menu },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}

module.exports = {
  buildOfficialNovemberMenus,
  buildOfficialOctoberMenus,
  seedOfficialNovemberMenus,
  seedOfficialOctoberMenus,
};
