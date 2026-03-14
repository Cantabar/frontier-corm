// ── DOM refs ──────────────────────────────────────────────────────
const grid = document.getElementById('grid');
const search = document.getElementById('search');
const toast = document.getElementById('toast');
const sidebar = document.getElementById('sidebar');
const filtersEl = document.getElementById('filters');
const sortSelect = document.getElementById('sort');

// ── State ─────────────────────────────────────────────────────────
let items = [];
let toastTimeout = null;

// Sidebar selection
let activeCategory = null; // null = all
let activeGroup = null;    // null = whole category

// Tag filter chips (OR within family, AND across families)
let activeSlotTags = new Set();
let activeSizeTags = new Set();

// Sort
let currentSort = 'name-asc';

// Tier ordering for sort
const TIER_ORDER = {
  Basic: 0, Standard: 1, Enhanced: 2,
  Prototype: 3, Experimental: 4, Exotic: 5,
};

// Tier badge colors
const TIER_COLORS = {
  Basic: '#666', Standard: '#b0b0b0', Enhanced: '#4caf50',
  Prototype: '#42a5f5', Experimental: '#ab47bc', Exotic: '#ffd740',
};

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  const res = await fetch('/items.json');
  items = await res.json();
  buildSidebar();
  buildFilterChips();
  search.addEventListener('input', applyFilters);
  sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    applyFilters();
  });
  applyFilters();
}

// ── Sidebar ───────────────────────────────────────────────────────
function buildSidebar() {
  // Build category → groups tree from items
  const tree = new Map(); // categoryName → Map<groupName, count>
  for (const item of items) {
    const cat = item.categoryName ?? 'Other';
    if (!tree.has(cat)) tree.set(cat, new Map());
    const groups = tree.get(cat);
    const grp = item.groupName ?? 'Ungrouped';
    groups.set(grp, (groups.get(grp) ?? 0) + 1);
  }

  sidebar.innerHTML = '';

  // All Items link
  const allBtn = document.createElement('button');
  allBtn.className = 'sidebar-item sidebar-all active';
  allBtn.textContent = `All Items (${items.length})`;
  allBtn.addEventListener('click', () => {
    activeCategory = null;
    activeGroup = null;
    updateSidebarActive();
    applyFilters();
  });
  sidebar.appendChild(allBtn);

  // Category sections
  for (const [catName, groups] of [...tree.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const catCount = [...groups.values()].reduce((a, b) => a + b, 0);

    const section = document.createElement('div');
    section.className = 'sidebar-section';

    const catBtn = document.createElement('button');
    catBtn.className = 'sidebar-item sidebar-category';
    catBtn.innerHTML = `<span class="sidebar-arrow">&#9656;</span> ${catName} <span class="sidebar-count">${catCount}</span>`;
    catBtn.addEventListener('click', () => {
      activeCategory = catName;
      activeGroup = null;
      section.classList.toggle('expanded', true);
      updateSidebarActive();
      applyFilters();
    });
    section.appendChild(catBtn);

    const groupList = document.createElement('div');
    groupList.className = 'sidebar-groups';
    for (const [grpName, count] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const grpBtn = document.createElement('button');
      grpBtn.className = 'sidebar-item sidebar-group';
      grpBtn.textContent = `${grpName} (${count})`;
      grpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeCategory = catName;
        activeGroup = grpName;
        section.classList.add('expanded');
        updateSidebarActive();
        applyFilters();
      });
      groupList.appendChild(grpBtn);
    }
    section.appendChild(groupList);
    sidebar.appendChild(section);
  }
}

function updateSidebarActive() {
  sidebar.querySelectorAll('.sidebar-item').forEach((el) => el.classList.remove('active'));
  if (!activeCategory) {
    sidebar.querySelector('.sidebar-all')?.classList.add('active');
    return;
  }
  // Find and highlight the matching category or group button
  const sections = sidebar.querySelectorAll('.sidebar-section');
  for (const sec of sections) {
    const catBtn = sec.querySelector('.sidebar-category');
    // Extract category name (strip arrow and count)
    const catText = catBtn.textContent.replace(/^\s*[\u25B6\u25B8\u25BA]\s*/, '').replace(/\s*\d+$/, '').trim();
    if (catText === activeCategory) {
      if (!activeGroup) {
        catBtn.classList.add('active');
      } else {
        const grpBtns = sec.querySelectorAll('.sidebar-group');
        for (const gb of grpBtns) {
          if (gb.textContent.startsWith(activeGroup)) {
            gb.classList.add('active');
            break;
          }
        }
      }
      break;
    }
  }
}

// ── Filter Chips ──────────────────────────────────────────────────
const SLOT_TAGS = [
  { tag: 'high_slot', label: 'High' },
  { tag: 'mid_slot', label: 'Mid' },
  { tag: 'low_slot', label: 'Low' },
  { tag: 'engine_slot', label: 'Engine' },
];
const SIZE_TAGS = [
  { tag: 'small_size', label: 'S' },
  { tag: 'medium_size', label: 'M' },
  { tag: 'large_size', label: 'L' },
];

function buildFilterChips() {
  filtersEl.innerHTML = '';

  function makeFamily(label, tagDefs, activeSet) {
    const wrapper = document.createElement('div');
    wrapper.className = 'chip-family';
    const lbl = document.createElement('span');
    lbl.className = 'chip-label';
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    for (const { tag, label: chipLabel } of tagDefs) {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.textContent = chipLabel;
      btn.addEventListener('click', () => {
        if (activeSet.has(tag)) {
          activeSet.delete(tag);
          btn.classList.remove('active');
        } else {
          activeSet.add(tag);
          btn.classList.add('active');
        }
        applyFilters();
      });
      wrapper.appendChild(btn);
    }
    return wrapper;
  }

  filtersEl.appendChild(makeFamily('Slot:', SLOT_TAGS, activeSlotTags));
  filtersEl.appendChild(makeFamily('Size:', SIZE_TAGS, activeSizeTags));
}

// ── Filtering & Sorting ───────────────────────────────────────────
function applyFilters() {
  const q = search.value.toLowerCase().trim();
  let filtered = items;

  // Sidebar filter
  if (activeCategory) {
    filtered = filtered.filter((i) => (i.categoryName ?? 'Other') === activeCategory);
    if (activeGroup) {
      filtered = filtered.filter((i) => (i.groupName ?? 'Ungrouped') === activeGroup);
    }
  }

  // Text search
  if (q) {
    filtered = filtered.filter(
      (i) => i.name.toLowerCase().includes(q) || String(i.typeId).includes(q),
    );
  }

  // Tag chips — OR within each family, AND across families
  if (activeSlotTags.size > 0) {
    filtered = filtered.filter((i) =>
      i.tags.some((t) => activeSlotTags.has(t)),
    );
  }
  if (activeSizeTags.size > 0) {
    filtered = filtered.filter((i) =>
      i.tags.some((t) => activeSizeTags.has(t)),
    );
  }

  // Sort
  filtered = [...filtered];
  switch (currentSort) {
    case 'name-asc':  filtered.sort((a, b) => a.name.localeCompare(b.name)); break;
    case 'name-desc': filtered.sort((a, b) => b.name.localeCompare(a.name)); break;
    case 'tier-asc':  filtered.sort((a, b) => (TIER_ORDER[a.metaGroupName] ?? -1) - (TIER_ORDER[b.metaGroupName] ?? -1)); break;
    case 'tier-desc': filtered.sort((a, b) => (TIER_ORDER[b.metaGroupName] ?? -1) - (TIER_ORDER[a.metaGroupName] ?? -1)); break;
  }

  render(filtered);
}

// ── Render Grid ───────────────────────────────────────────────────
function render(list) {
  grid.innerHTML = '';
  if (list.length === 0) {
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#666;">No items found</p>';
    return;
  }
  for (const item of list) {
    const card = document.createElement('div');
    card.className = 'item-card';
    const tierColor = TIER_COLORS[item.metaGroupName];
    if (tierColor) {
      card.style.borderLeftColor = tierColor;
    }
    card.innerHTML = `
      <img src="/${item.icon}" alt="${item.name}" loading="lazy" />
      <span class="name">${item.name}</span>
      <span class="group-name">${item.groupName ?? ''}</span>
      <span class="type-id">${item.typeId}</span>
    `;
    card.addEventListener('click', () => copyCommand(item));
    grid.appendChild(card);
  }
}

// ── Clipboard ─────────────────────────────────────────────────────
async function copyCommand(item) {
  const cmd = `/giveitem ${item.typeId} 100`;
  try {
    await navigator.clipboard.writeText(cmd);
    showToast(`Copied: ${cmd}`);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = cmd;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(`Copied: ${cmd}`);
  }
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 1500);
}

init();
