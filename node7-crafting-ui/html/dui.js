(() => {
    'use strict';

    const byId = (id) => document.getElementById(id);
    const app = byId('duiRoot');
    const title = byId('title');
    const subtitle = byId('subtitle');
    const station = byId('station');
    const locationEl = byId('location');
    const stationStatus = byId('stationStatus');
    const categories = byId('categories');
    const recipeGrid = byId('recipeGrid');
    const recipeCount = byId('recipeCount');
    const emptyState = byId('emptyState');
    const loadingState = byId('loadingState');
    const loadingText = byId('loadingText');
    const searchInput = byId('searchInput');
    const availabilityFilters = byId('availabilityFilters');
    const closeButton = byId('closeButton');

    const detailsEmpty = byId('detailsEmpty');
    const detailsContent = byId('detailsContent');
    const detailIcon = byId('detailIcon');
    const detailRarity = byId('detailRarity');
    const detailName = byId('detailName');
    const detailOutput = byId('detailOutput');
    const detailDescription = byId('detailDescription');
    const detailTime = byId('detailTime');
    const quantityMinus = byId('quantityMinus');
    const quantityPlus = byId('quantityPlus');
    const quantityMax = byId('quantityMax');
    const quantityInput = byId('quantityInput');
    const maxCraftable = byId('maxCraftable');
    const ingredientList = byId('ingredientList');
    const requirementsBlock = byId('requirementsBlock');
    const requirementsList = byId('requirementsList');
    const craftButton = byId('craftButton');
    const craftOutput = byId('craftOutput');
    const lockMessage = byId('lockMessage');

    const activeCraft = byId('activeCraft');
    const activeCraftIcon = byId('activeCraftIcon');
    const activeCraftStatus = byId('activeCraftStatus');
    const activeCraftPercent = byId('activeCraftPercent');
    const activeCraftName = byId('activeCraftName');
    const activeCraftFill = byId('activeCraftFill');
    const activeCraftQuantity = byId('activeCraftQuantity');
    const activeCraftRemaining = byId('activeCraftRemaining');
    const queueTrack = byId('queueTrack');
    const queueCount = byId('queueCount');
    const busyState = byId('busyState');
    const busyText = byId('busyText');
    const toastContainer = byId('toastContainer');

    const state = {
        open: false,
        payload: {},
        categories: [],
        recipes: [],
        selectedCategory: 'all',
        selectedRecipeId: null,
        availabilityFilter: 'all',
        search: '',
        quantity: 1,
        maxQuantity: 99,
        queue: [],
        activeProgress: null,
        busy: false,
        busyText: 'CRAFTING',
        loading: false,
        loadingText: 'LOADING RECIPES',
        inventory: {},
        closeOnEscape: true
    };

    const resourceName = typeof GetParentResourceName === 'function'
        ? GetParentResourceName()
        : 'node7-crafting-ui';

    function post(action, data = {}) {
        return fetch(`https://${resourceName}/uiAction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify({ action, data })
        }).then((response) => response.json()).catch(() => ({ ok: false }));
    }

    function safeText(value, fallback = '') {
        return value === null || value === undefined ? fallback : String(value);
    }

    function clamp(value, min, max) {
        const number = Number(value);
        if (!Number.isFinite(number)) return min;
        return Math.max(min, Math.min(max, Math.floor(number)));
    }

    function recipeId(recipe, index) {
        return safeText(recipe?.id || recipe?.item || `recipe_${index}`);
    }

    function getRecipeById(id) {
        return state.recipes.find((recipe, index) => recipeId(recipe, index) === id) || null;
    }

    function normalizedCategories(payloadCategories, recipes) {
        const provided = Array.isArray(payloadCategories) ? payloadCategories : [];
        const result = [];
        const seen = new Set();

        const push = (id, label) => {
            const key = safeText(id).trim();
            if (!key || seen.has(key)) return;
            seen.add(key);
            result.push({ id: key, label: safeText(label || key) });
        };

        push('all', 'All Recipes');
        provided.forEach((entry) => {
            if (typeof entry === 'string') push(entry, entry);
            else if (entry && typeof entry === 'object') push(entry.id || entry.name, entry.label || entry.name || entry.id);
        });
        recipes.forEach((recipe) => {
            const category = safeText(recipe?.category || 'other');
            if (category && category !== 'all') push(category, recipe?.categoryLabel || category);
        });
        return result;
    }

    function formatDuration(ms) {
        const value = Number(ms);
        if (!Number.isFinite(value) || value <= 0) return 'Instant';
        if (value < 1000) return `${Math.round(value)} ms`;
        const seconds = value / 1000;
        if (seconds < 60) return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`;
        const minutes = Math.floor(seconds / 60);
        const remaining = Math.round(seconds % 60);
        return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
    }

    function ingredientOwned(ingredient) {
        const item = safeText(ingredient?.item);
        if (item && Object.prototype.hasOwnProperty.call(state.inventory, item)) return Number(state.inventory[item]) || 0;
        return Number(ingredient?.owned) || 0;
    }

    function baseRequired(ingredient) {
        return Math.max(0, Number(ingredient?.required ?? ingredient?.amount ?? 0) || 0);
    }

    function requiredFor(ingredient) {
        return baseRequired(ingredient) * state.quantity;
    }

    function recipeMaxCraftable(recipe) {
        if (!recipe) return 1;
        const explicit = Number(recipe.maxCraftable);
        const recipeMax = Number(recipe.maxQuantity);
        let max = state.maxQuantity;

        if (Number.isFinite(recipeMax) && recipeMax > 0) max = Math.min(max, Math.floor(recipeMax));
        if (Number.isFinite(explicit) && explicit >= 0) return Math.max(0, Math.min(max, Math.floor(explicit)));

        const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
        const limited = ingredients.filter((ingredient) => baseRequired(ingredient) > 0);
        if (!limited.length) return max;

        const derived = limited.reduce((current, ingredient) => {
            const crafts = Math.floor(ingredientOwned(ingredient) / baseRequired(ingredient));
            return Math.min(current, crafts);
        }, max);
        return Math.max(0, derived);
    }

    function hasMaterials(recipe, quantity = state.quantity) {
        if (!recipe || recipe.locked === true) return false;
        const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
        return ingredients.every((ingredient) => ingredientOwned(ingredient) >= baseRequired(ingredient) * quantity);
    }

    function canCraft(recipe) {
        return !state.busy && !state.loading && hasMaterials(recipe, state.quantity);
    }

    function visibleRecipes() {
        const query = state.search.trim().toLowerCase();
        return state.recipes.filter((recipe) => {
            const category = safeText(recipe?.category || 'other');
            if (state.selectedCategory !== 'all' && category !== state.selectedCategory) return false;

            if (state.availabilityFilter === 'craftable' && !hasMaterials(recipe, 1)) return false;
            if (state.availabilityFilter === 'locked' && recipe.locked !== true) return false;

            if (!query) return true;
            const haystack = [recipe?.label, recipe?.name, recipe?.id, recipe?.item, recipe?.description, recipe?.rarity, recipe?.category]
                .map((value) => safeText(value).toLowerCase()).join(' ');
            return haystack.includes(query);
        });
    }

    function imageConfig() {
        const cfg = state.payload?.imageConfig || {};
        return {
            enabled: cfg.enabled !== false,
            resource: safeText(cfg.resource || 'node7-inventory').trim() || 'node7-inventory',
            path: safeText(cfg.path || 'html/images').replace(/^\/+|\/+$/g, ''),
            extension: safeText(cfg.extension || 'png').replace(/^\./, '') || 'png'
        };
    }

    function inventoryImageBase() {
        const cfg = imageConfig();
        return `https://cfx-nui-${cfg.resource}/${cfg.path}/`;
    }

    function inventoryImageUrl(entry) {
        const cfg = imageConfig();
        if (!cfg.enabled) return '';
        const base = inventoryImageBase();
        const raw = safeText(entry?.image || '').trim();
        const item = safeText(entry?.item || entry?.id || '').trim();

        if (raw) {
            if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
            const normalized = raw.replace(/\\/g, '/').replace(/^\.\//, '');
            const genericMarker = `${cfg.resource}/${cfg.path}/`.toLowerCase();
            const node7Marker = 'node7-inventory/html/images/';
            const lower = normalized.toLowerCase();
            const genericIndex = lower.indexOf(genericMarker);
            const node7Index = lower.indexOf(node7Marker);
            if (genericIndex >= 0) return base + normalized.slice(genericIndex + genericMarker.length);
            if (node7Index >= 0) return base + normalized.slice(node7Index + node7Marker.length);
            if (normalized.includes('/')) return normalized;
            return base + normalized;
        }

        return item ? `${base}${encodeURIComponent(item)}.${cfg.extension}` : '';
    }

    function setIcon(element, entry, fallback = 'N7') {
        element.replaceChildren();
        const image = inventoryImageUrl(entry);
        if (!image) {
            element.textContent = safeText(entry?.icon || fallback).slice(0, 3).toUpperCase();
            return;
        }
        const img = document.createElement('img');
        img.src = image;
        img.alt = '';
        img.draggable = false;
        img.loading = 'eager';
        img.decoding = 'async';
        img.addEventListener('error', () => {
            element.replaceChildren(document.createTextNode(safeText(entry?.icon || fallback).slice(0, 3).toUpperCase()));
        }, { once: true });
        element.appendChild(img);
    }

    function categoryCount(categoryId) {
        if (categoryId === 'all') return state.recipes.length;
        return state.recipes.filter((recipe) => safeText(recipe?.category || 'other') === categoryId).length;
    }

    function renderStatus() {
        let text = 'READY';
        let className = 'is-ready';
        if (state.loading) { text = 'LOADING'; className = 'is-loading'; }
        else if (state.busy) { text = state.busyText || 'CRAFTING'; className = 'is-crafting'; }
        stationStatus.textContent = text.toUpperCase();
        stationStatus.className = `station-status ${className}`;
    }

    function renderLoading() {
        loadingState.classList.toggle('is-hidden', !state.loading);
        loadingText.textContent = safeText(state.loadingText || 'LOADING RECIPES').toUpperCase();
        recipeGrid.classList.toggle('is-loading', state.loading);
        renderStatus();
    }

    function renderFilters() {
        availabilityFilters.querySelectorAll('[data-filter]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.filter === state.availabilityFilter);
        });
    }

    function renderCategories() {
        categories.replaceChildren();
        state.categories.forEach((category) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `category-button${state.selectedCategory === category.id ? ' is-active' : ''}`;
            button.dataset.categoryId = category.id;

            const mark = document.createElement('span');
            mark.className = 'category-mark';
            mark.textContent = safeText(category.label).slice(0, 1).toUpperCase();
            const label = document.createElement('span');
            label.textContent = category.label;
            const count = document.createElement('span');
            count.className = 'category-count';
            count.textContent = categoryCount(category.id);
            button.append(mark, label, count);
            button.addEventListener('click', () => selectCategory(category.id, true));
            categories.appendChild(button);
        });
    }

    function updateRecipeSelection() {
        recipeGrid.querySelectorAll('.recipe-card').forEach((card) => {
            card.classList.toggle('is-selected', card.dataset.recipeId === state.selectedRecipeId);
        });
    }

    function updateRecipeCraftStates() {
        recipeGrid.querySelectorAll('.recipe-card').forEach((card) => {
            const recipe = getRecipeById(card.dataset.recipeId);
            if (!recipe) return;
            const craftable = hasMaterials(recipe, 1);
            const status = card.querySelector('.card-status');
            if (status) {
                status.className = `card-status ${recipe.locked ? '' : craftable ? 'can-craft' : 'missing'}`;
                status.textContent = recipe.locked ? '×' : craftable ? '✓' : '!';
            }
        });
    }

    function selectRecipe(id, notify = true) {
        if (!id) return;
        const changed = state.selectedRecipeId !== id;
        state.selectedRecipeId = id;
        if (changed) state.quantity = 1;
        updateRecipeSelection();
        updateRecipeCraftStates();
        renderDetails();
        const card = recipeGrid.querySelector(`[data-recipe-id="${CSS.escape(id)}"]`);
        if (card) card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        if (notify && changed) post('selectRecipe', { recipeId: id });
    }

    function chooseInitialRecipe() {
        const visible = visibleRecipes();
        if (!visible.length) { state.selectedRecipeId = null; return; }
        const current = getRecipeById(state.selectedRecipeId);
        if (!current || !visible.includes(current)) {
            const recipe = visible[0];
            state.selectedRecipeId = recipeId(recipe, state.recipes.indexOf(recipe));
            state.quantity = 1;
        }
    }

    function selectCategory(id, notify = true) {
        if (!state.categories.some((category) => category.id === id)) return;
        state.selectedCategory = id;
        state.quantity = 1;
        chooseInitialRecipe();
        renderCategories();
        renderRecipes();
        renderDetails();
        if (notify) post('selectCategory', { category: id });
    }

    function renderRecipes() {
        const recipes = visibleRecipes();
        recipeGrid.replaceChildren();
        recipeCount.textContent = `${recipes.length} recipe${recipes.length === 1 ? '' : 's'}`;
        emptyState.classList.toggle('is-hidden', recipes.length !== 0 || state.loading);
        recipeGrid.classList.toggle('is-hidden', recipes.length === 0 && !state.loading);

        recipes.forEach((recipe) => {
            const originalIndex = state.recipes.indexOf(recipe);
            const id = recipeId(recipe, originalIndex);
            const craftable = hasMaterials(recipe, 1);
            const card = document.createElement('button');
            card.type = 'button';
            card.dataset.recipeId = id;
            card.className = ['recipe-card', state.selectedRecipeId === id ? 'is-selected' : '', recipe.locked === true ? 'is-locked' : ''].filter(Boolean).join(' ');

            const top = document.createElement('div');
            top.className = 'card-top';
            const icon = document.createElement('div');
            icon.className = 'item-icon';
            setIcon(icon, recipe, safeText(recipe.label || recipe.name || 'N7').slice(0, 2));
            const status = document.createElement('div');
            status.className = `card-status ${recipe.locked ? '' : craftable ? 'can-craft' : 'missing'}`;
            status.textContent = recipe.locked ? '×' : craftable ? '✓' : '!';
            top.append(icon, status);

            const copy = document.createElement('div');
            copy.className = 'card-copy';
            const rarity = document.createElement('div');
            rarity.className = 'card-rarity';
            rarity.textContent = safeText(recipe.rarity || recipe.category || 'Recipe');
            const name = document.createElement('div');
            name.className = 'card-name';
            name.textContent = safeText(recipe.label || recipe.name || recipe.item || 'Unnamed Recipe');
            const output = document.createElement('div');
            output.className = 'card-output';
            output.textContent = `Produces ×${Math.max(1, Number(recipe.output) || 1)}`;
            copy.append(rarity, name, output);
            card.append(top, copy);
            card.addEventListener('click', () => selectRecipe(id, true));
            recipeGrid.appendChild(card);
        });
    }

    function normalizedRequirements(recipe) {
        const source = recipe?.requirements;
        const result = [];
        if (Array.isArray(source)) {
            source.forEach((entry) => {
                if (typeof entry === 'string') result.push({ label: entry, met: true });
                else if (entry && typeof entry === 'object') result.push({ label: safeText(entry.label || entry.name || entry.text || 'Requirement'), value: safeText(entry.value || ''), met: entry.met !== false });
            });
        } else if (typeof source === 'string' && source.trim()) {
            result.push({ label: source, met: true });
        } else if (source && typeof source === 'object') {
            Object.entries(source).forEach(([key, value]) => {
                if (value && typeof value === 'object') result.push({ label: safeText(value.label || key), value: safeText(value.value || ''), met: value.met !== false });
                else result.push({ label: key, value: safeText(value), met: value !== false });
            });
        }
        if (recipe?.tool) result.push({ label: 'Tool', value: safeText(typeof recipe.tool === 'object' ? recipe.tool.label || recipe.tool.name : recipe.tool), met: typeof recipe.tool === 'object' ? recipe.tool.met !== false : true });
        if (recipe?.stationRequirement) result.push({ label: 'Station', value: safeText(recipe.stationRequirement), met: true });
        return result;
    }

    function renderRequirements(recipe) {
        const entries = normalizedRequirements(recipe);
        requirementsList.replaceChildren();
        requirementsBlock.classList.toggle('is-hidden', entries.length === 0);
        entries.forEach((entry) => {
            const row = document.createElement('div');
            row.className = `requirement-row ${entry.met ? 'is-met' : 'is-unmet'}`;
            const stateMark = document.createElement('span');
            stateMark.className = 'requirement-state';
            stateMark.textContent = entry.met ? '✓' : '×';
            const label = document.createElement('span');
            label.textContent = entry.label;
            const value = document.createElement('strong');
            value.textContent = entry.value || '';
            row.append(stateMark, label, value);
            requirementsList.appendChild(row);
        });
    }

    function renderDetails() {
        const recipe = getRecipeById(state.selectedRecipeId);
        detailsEmpty.classList.toggle('is-hidden', Boolean(recipe));
        detailsContent.classList.toggle('is-hidden', !recipe);
        if (!recipe) return;

        const output = Math.max(1, Number(recipe.output) || 1);
        const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
        const max = recipeMaxCraftable(recipe);
        if (state.quantity > Math.max(1, max)) state.quantity = Math.max(1, max || 1);
        const craftable = canCraft(recipe);

        setIcon(detailIcon, recipe, safeText(recipe.label || recipe.name || 'N7').slice(0, 2));
        detailRarity.textContent = safeText(recipe.rarity || recipe.category || 'Recipe').toUpperCase();
        detailName.textContent = safeText(recipe.label || recipe.name || recipe.item || 'Unnamed Recipe');
        detailOutput.textContent = `×${output * state.quantity}`;
        detailDescription.textContent = safeText(recipe.description || 'No description supplied by the crafting resource.');
        detailTime.textContent = formatDuration((Number(recipe.duration) || 0) * state.quantity);
        quantityInput.value = state.quantity;
        quantityInput.max = Math.max(1, max || 1);
        craftOutput.textContent = `Create ×${output * state.quantity}`;
        maxCraftable.textContent = `MAX CRAFTABLE: ${max}`;

        ingredientList.replaceChildren();
        if (!ingredients.length) {
            const row = document.createElement('div');
            row.className = 'ingredient-row has-enough no-materials';
            row.innerHTML = '<span class="ingredient-state">✓</span><span class="ingredient-name">No materials required</span><span class="ingredient-amount">—</span>';
            ingredientList.appendChild(row);
        } else {
            ingredients.forEach((ingredient) => {
                const owned = ingredientOwned(ingredient);
                const required = requiredFor(ingredient);
                const enough = owned >= required;
                const ratio = required <= 0 ? 1 : Math.min(1, owned / required);
                const row = document.createElement('div');
                row.className = `ingredient-row ${enough ? 'has-enough' : 'is-missing'}`;

                const status = document.createElement('span');
                status.className = 'ingredient-state';
                status.textContent = enough ? '✓' : '×';
                const image = document.createElement('span');
                image.className = 'ingredient-icon';
                setIcon(image, ingredient, safeText(ingredient.label || ingredient.name || ingredient.item || 'M').slice(0, 2));
                const name = document.createElement('span');
                name.className = 'ingredient-name';
                name.textContent = safeText(ingredient.label || ingredient.name || ingredient.item || 'Material');
                const amount = document.createElement('span');
                amount.className = 'ingredient-amount';
                amount.innerHTML = `<span class="ingredient-owned">${owned}</span> / <span class="ingredient-needed">${required}</span>`;
                const meter = document.createElement('span');
                meter.className = 'ingredient-meter';
                const fill = document.createElement('i');
                fill.style.width = `${Math.round(ratio * 100)}%`;
                meter.appendChild(fill);
                row.append(status, image, name, amount, meter);
                ingredientList.appendChild(row);
            });
        }

        renderRequirements(recipe);
        const locked = recipe.locked === true;
        lockMessage.classList.toggle('is-hidden', !locked);
        lockMessage.textContent = locked ? safeText(recipe.lockReason || 'This recipe is currently unavailable.') : '';

        craftButton.disabled = !craftable || max < 1;
        quantityMinus.disabled = state.busy || state.loading || state.quantity <= 1;
        quantityPlus.disabled = state.busy || state.loading || state.quantity >= Math.max(1, max);
        quantityMax.disabled = state.busy || state.loading || max < 1 || state.quantity >= max;
        quantityInput.disabled = state.busy || state.loading || max < 1;
    }

    function statusLabel(status) {
        const value = safeText(status || 'queued').toLowerCase();
        if (value === 'crafting' || value === 'active') return 'CRAFTING';
        if (value === 'complete' || value === 'completed') return 'COMPLETE';
        if (value === 'failed' || value === 'error') return 'FAILED';
        if (value === 'cancelled' || value === 'canceled') return 'CANCELLED';
        return 'QUEUED';
    }

    function currentProgressEntry() {
        if (state.activeProgress && safeText(state.activeProgress.id || state.activeProgress.recipeId)) return state.activeProgress;
        return state.queue.find((entry) => ['crafting', 'active'].includes(safeText(entry.status).toLowerCase())) || null;
    }

    function renderActiveProgress() {
        const entry = currentProgressEntry();
        activeCraft.classList.toggle('is-hidden', !entry);
        if (!entry) {
            activeCraftIcon.dataset.entryId = '';
            return;
        }
        const progress = clamp(entry.progress ?? 0, 0, 100);
        const recipe = getRecipeById(safeText(entry.recipeId));
        const visual = { ...(recipe || {}), ...(entry || {}) };
        const activeId = safeText(entry.id || entry.recipeId);
        if (activeCraftIcon.dataset.entryId !== activeId) {
            activeCraftIcon.dataset.entryId = activeId;
            setIcon(activeCraftIcon, visual, safeText(entry.label || recipe?.label || 'N7').slice(0, 2));
        }
        activeCraftStatus.textContent = statusLabel(entry.status);
        activeCraftPercent.textContent = `${progress}%`;
        activeCraftName.textContent = safeText(entry.label || recipe?.label || entry.recipeId || 'Current Craft');
        activeCraftFill.style.width = `${progress}%`;
        activeCraftQuantity.textContent = `×${Math.max(1, Number(entry.quantity) || 1)}`;
        let remaining = Number(entry.remainingMs ?? entry.remaining);
        if (!Number.isFinite(remaining) && Number(entry.duration) > 0) remaining = Number(entry.duration) * (1 - progress / 100);
        activeCraftRemaining.textContent = Number.isFinite(remaining) && remaining > 0 ? `${formatDuration(remaining)} remaining` : (progress >= 100 ? 'Complete' : '--');
    }

    function renderQueue() {
        const queue = Array.isArray(state.queue) ? state.queue : [];
        queueTrack.replaceChildren();
        queueCount.textContent = queue.length;
        if (!queue.length) {
            const empty = document.createElement('div');
            empty.className = 'queue-empty';
            empty.textContent = 'No active crafts';
            queueTrack.appendChild(empty);
            renderActiveProgress();
            return;
        }

        queue.forEach((entry) => {
            const id = safeText(entry.id || entry.recipeId);
            const recipe = getRecipeById(safeText(entry.recipeId));
            const visual = { ...(recipe || {}), ...(entry || {}) };
            const item = document.createElement('div');
            item.className = `queue-item status-${safeText(entry.status || 'queued').toLowerCase()}`;
            item.dataset.queueId = id;

            const icon = document.createElement('span');
            icon.className = 'queue-item-icon';
            setIcon(icon, visual, safeText(entry.label || recipe?.label || 'N7').slice(0, 2));
            const body = document.createElement('div');
            body.className = 'queue-item-body';
            const top = document.createElement('div');
            top.className = 'queue-item-top';
            const label = document.createElement('strong');
            label.textContent = safeText(entry.label || recipe?.label || entry.recipeId || 'Craft');
            const status = document.createElement('span');
            status.className = 'queue-status';
            status.textContent = statusLabel(entry.status);
            top.append(label, status);
            const meta = document.createElement('div');
            meta.className = 'queue-item-meta';
            const quantity = document.createElement('span');
            quantity.textContent = `×${Math.max(1, Number(entry.quantity) || 1)}`;
            const percent = document.createElement('span');
            percent.className = 'queue-percent';
            percent.textContent = `${clamp(entry.progress ?? 0, 0, 100)}%`;
            meta.append(quantity, percent);
            const bar = document.createElement('div');
            bar.className = 'queue-progress';
            const fill = document.createElement('span');
            fill.style.width = `${clamp(entry.progress ?? 0, 0, 100)}%`;
            bar.appendChild(fill);
            body.append(top, meta, bar);
            item.append(icon, body);

            if (entry.cancellable === true) {
                const cancel = document.createElement('button');
                cancel.type = 'button';
                cancel.className = 'queue-cancel';
                cancel.textContent = '×';
                cancel.title = 'Cancel craft';
                cancel.addEventListener('click', () => post('cancelCraft', { id, recipeId: entry.recipeId }));
                item.appendChild(cancel);
            }
            queueTrack.appendChild(item);
        });
        renderActiveProgress();
    }

    function updateQueueEntryDom(payload) {
        const id = safeText(payload.id || payload.recipeId);
        const item = id ? queueTrack.querySelector(`[data-queue-id="${CSS.escape(id)}"]`) : null;
        if (!item) { renderQueue(); return; }
        const progress = clamp(payload.progress ?? 0, 0, 100);
        const fill = item.querySelector('.queue-progress > span');
        const percent = item.querySelector('.queue-percent');
        const status = item.querySelector('.queue-status');
        if (fill) fill.style.width = `${progress}%`;
        if (percent) percent.textContent = `${progress}%`;
        if (status) status.textContent = statusLabel(payload.status);
        item.className = `queue-item status-${safeText(payload.status || 'queued').toLowerCase()}`;
    }

    function renderBusy() {
        busyState.classList.toggle('is-hidden', !state.busy);
        busyText.textContent = safeText(state.busyText || 'CRAFTING').toUpperCase();
        renderStatus();
    }

    function renderAll() {
        renderFilters();
        renderCategories();
        renderRecipes();
        renderDetails();
        renderQueue();
        renderBusy();
        renderLoading();
    }

    function open(payload) {
        state.open = true;
        state.payload = payload && typeof payload === 'object' ? payload : {};
        state.recipes = Array.isArray(state.payload.recipes) ? state.payload.recipes : [];
        state.categories = normalizedCategories(state.payload.categories, state.recipes);
        state.selectedCategory = safeText(state.payload.selectedCategory || 'all');
        if (!state.categories.some((cat) => cat.id === state.selectedCategory)) state.selectedCategory = 'all';
        state.availabilityFilter = ['all', 'craftable', 'locked'].includes(state.payload.availabilityFilter) ? state.payload.availabilityFilter : 'all';
        state.search = '';
        state.quantity = 1;
        state.maxQuantity = clamp(state.payload.maxQuantity || 99, 1, 9999);
        state.queue = Array.isArray(state.payload.queue) ? state.payload.queue : [];
        state.activeProgress = state.payload.activeProgress && typeof state.payload.activeProgress === 'object' ? { ...state.payload.activeProgress } : null;
        state.busy = state.payload.busy === true;
        state.busyText = safeText(state.payload.busyText || 'CRAFTING');
        state.loading = state.payload.loading === true;
        state.loadingText = safeText(state.payload.loadingText || 'LOADING RECIPES');
        state.inventory = state.payload.inventory && typeof state.payload.inventory === 'object' ? { ...state.payload.inventory } : {};
        state.closeOnEscape = state.payload.closeOnEscape !== false;

        title.textContent = safeText(state.payload.title || 'CRAFTING').toUpperCase();
        subtitle.textContent = safeText(state.payload.subtitle || 'Available Recipes');
        station.textContent = safeText(state.payload.station || 'WORKBENCH').toUpperCase();
        locationEl.textContent = safeText(state.payload.location || 'UNKNOWN').toUpperCase();
        searchInput.value = '';
        chooseInitialRecipe();
        renderAll();

        app.classList.remove('is-hidden', 'is-closing');
        app.classList.remove('is-opening');
        void app.offsetWidth;
        app.classList.add('is-opening');
        app.setAttribute('aria-hidden', 'false');
        window.setTimeout(() => app.classList.remove('is-opening'), 620);
    }

    function closeVisual() {
        state.open = false;
        app.classList.remove('is-opening');
        app.classList.add('is-closing');
        app.setAttribute('aria-hidden', 'true');
        state.busy = false;
        window.setTimeout(() => {
            if (!state.open) {
                app.classList.add('is-hidden');
                app.classList.remove('is-closing');
            }
        }, 360);
    }

    function update(payload) {
        if (!payload || typeof payload !== 'object') return;
        if (Array.isArray(payload.recipes)) state.recipes = payload.recipes;
        if (Array.isArray(payload.categories)) state.categories = normalizedCategories(payload.categories, state.recipes);
        if (Array.isArray(payload.queue)) state.queue = payload.queue;
        if (payload.inventory && typeof payload.inventory === 'object') state.inventory = { ...payload.inventory };
        if (payload.maxQuantity !== undefined) state.maxQuantity = clamp(payload.maxQuantity, 1, 9999);
        if (payload.loading !== undefined) state.loading = payload.loading === true;
        if (payload.loadingText !== undefined) state.loadingText = safeText(payload.loadingText);
        if (payload.busy !== undefined) state.busy = payload.busy === true;
        if (payload.busyText !== undefined) state.busyText = safeText(payload.busyText);
        if (payload.activeProgress !== undefined) state.activeProgress = payload.activeProgress && typeof payload.activeProgress === 'object' ? { ...payload.activeProgress } : null;
        if (payload.title !== undefined) title.textContent = safeText(payload.title).toUpperCase();
        if (payload.subtitle !== undefined) subtitle.textContent = safeText(payload.subtitle);
        if (payload.station !== undefined) station.textContent = safeText(payload.station).toUpperCase();
        if (payload.location !== undefined) locationEl.textContent = safeText(payload.location).toUpperCase();
        if (payload.selectedRecipeId !== undefined) state.selectedRecipeId = safeText(payload.selectedRecipeId);
        chooseInitialRecipe();
        renderAll();
    }

    function updateQueueProgress(payload) {
        if (!payload || typeof payload !== 'object') return;
        const id = safeText(payload.id || payload.recipeId);
        let found = false;
        state.queue = state.queue.map((entry) => {
            const entryId = safeText(entry.id || entry.recipeId);
            if (entryId !== id) return entry;
            found = true;
            return { ...entry, ...payload };
        });
        if (!found && id) state.queue.push({ ...payload, id });
        state.activeProgress = { ...(state.activeProgress || {}), ...payload, id };
        updateQueueEntryDom(payload);
        renderActiveProgress();
        queueCount.textContent = state.queue.length;

        const progress = clamp(payload.progress ?? 0, 0, 100);
        if (progress >= 100 && payload.keepComplete !== true) {
            window.setTimeout(() => {
                state.queue = state.queue.filter((entry) => safeText(entry.id || entry.recipeId) !== id);
                if (safeText(state.activeProgress?.id || state.activeProgress?.recipeId) === id) state.activeProgress = null;
                renderQueue();
            }, 700);
        }
    }

    function showToast(message, kind = 'info') {
        const text = safeText(message).trim();
        if (!text) return;
        const toast = document.createElement('div');
        toast.className = `toast ${safeText(kind)}`;
        toast.textContent = text;
        toastContainer.appendChild(toast);
        window.setTimeout(() => toast.remove(), 3200);
    }

    function setQuantity(value) {
        if (state.busy || state.loading) return;
        const recipe = getRecipeById(state.selectedRecipeId);
        const max = Math.max(1, recipeMaxCraftable(recipe) || 1);
        state.quantity = clamp(value, 1, max);
        renderDetails();
        post('changeQuantity', { recipeId: state.selectedRecipeId, quantity: state.quantity });
    }

    function cycleCategory(direction) {
        if (!state.categories.length) return;
        const current = Math.max(0, state.categories.findIndex((category) => category.id === state.selectedCategory));
        const next = (current + direction + state.categories.length) % state.categories.length;
        selectCategory(state.categories[next].id, true);
    }

    function moveRecipeSelection(direction) {
        const cards = Array.from(recipeGrid.querySelectorAll('.recipe-card'));
        if (!cards.length) return;
        let current = cards.find((card) => card.dataset.recipeId === state.selectedRecipeId) || cards[0];
        const currentRect = current.getBoundingClientRect();
        const cx = currentRect.left + currentRect.width / 2;
        const cy = currentRect.top + currentRect.height / 2;
        let best = null;
        let bestScore = Infinity;
        cards.forEach((card) => {
            if (card === current) return;
            const rect = card.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const dx = x - cx;
            const dy = y - cy;
            if (direction === 'left' && dx >= -2) return;
            if (direction === 'right' && dx <= 2) return;
            if (direction === 'up' && dy >= -2) return;
            if (direction === 'down' && dy <= 2) return;
            const primary = direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
            const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
            const score = primary + secondary * 2.2;
            if (score < bestScore) { bestScore = score; best = card; }
        });
        if (best) selectRecipe(best.dataset.recipeId, true);
    }

    searchInput.addEventListener('input', () => {
        state.search = searchInput.value;
        chooseInitialRecipe();
        renderRecipes();
        renderDetails();
    });

    availabilityFilters.addEventListener('click', (event) => {
        const button = event.target.closest('[data-filter]');
        if (!button) return;
        const filter = button.dataset.filter;
        if (!['all', 'craftable', 'locked'].includes(filter)) return;
        state.availabilityFilter = filter;
        chooseInitialRecipe();
        renderFilters();
        renderRecipes();
        renderDetails();
    });

    closeButton.addEventListener('click', () => post('close'));
    quantityMinus.addEventListener('click', () => setQuantity(state.quantity - 1));
    quantityPlus.addEventListener('click', () => setQuantity(state.quantity + 1));
    quantityMax.addEventListener('click', () => {
        const recipe = getRecipeById(state.selectedRecipeId);
        setQuantity(Math.max(1, recipeMaxCraftable(recipe) || 1));
    });
    quantityInput.addEventListener('change', () => setQuantity(quantityInput.value));
    quantityInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') quantityInput.blur(); });

    craftButton.addEventListener('click', () => {
        const recipe = getRecipeById(state.selectedRecipeId);
        if (!recipe || !canCraft(recipe)) return;
        post('craft', {
            recipeId: state.selectedRecipeId,
            item: safeText(recipe.item || recipe.id),
            image: safeText(recipe.image || ''),
            label: safeText(recipe.label || recipe.name || recipe.item || 'Recipe'),
            quantity: state.quantity,
            duration: Number(recipe.duration) || 0,
            output: Math.max(1, Number(recipe.output) || 1)
        });
    });

    document.addEventListener('keydown', (event) => {
        if (!state.open) return;
        const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
        if (event.key === 'Escape' && state.closeOnEscape) { event.preventDefault(); post('close'); return; }
        if (typing) return;

        const key = event.key.toLowerCase();
        if (key === '/' || key === 'f') { event.preventDefault(); searchInput.focus(); return; }
        if (key === 'q' || event.key === 'PageUp') { event.preventDefault(); cycleCategory(-1); return; }
        if (key === 'e' || event.key === 'PageDown') { event.preventDefault(); cycleCategory(1); return; }
        if (key === 'a' || event.key === 'ArrowLeft') { event.preventDefault(); moveRecipeSelection('left'); return; }
        if (key === 'd' || event.key === 'ArrowRight') { event.preventDefault(); moveRecipeSelection('right'); return; }
        if (key === 'w' || event.key === 'ArrowUp') { event.preventDefault(); moveRecipeSelection('up'); return; }
        if (key === 's' || event.key === 'ArrowDown') { event.preventDefault(); moveRecipeSelection('down'); return; }
        if (event.key === 'Enter' && !craftButton.disabled) { event.preventDefault(); craftButton.click(); }
    });

    window.addEventListener('message', (event) => {
        const message = event.data || {};
        const action = safeText(message.action);
        const payload = message.payload;
        switch (action) {
            case 'open': open(payload); break;
            case 'close': closeVisual(); break;
            case 'update': update(payload); break;
            case 'progress': updateQueueProgress(payload); break;
            case 'queue':
                state.queue = Array.isArray(payload) ? payload : [];
                if (!state.queue.length) state.activeProgress = null;
                renderQueue();
                break;
            case 'inventory':
                state.inventory = payload && typeof payload === 'object' ? { ...payload } : {};
                updateRecipeCraftStates();
                renderDetails();
                if (state.availabilityFilter === 'craftable') { chooseInitialRecipe(); renderRecipes(); renderDetails(); }
                break;
            case 'busy':
                state.busy = payload?.busy === true;
                state.busyText = safeText(payload?.text || 'CRAFTING');
                renderBusy();
                renderDetails();
                break;
            case 'loading':
                state.loading = payload?.loading === true;
                state.loadingText = safeText(payload?.text || 'LOADING RECIPES');
                renderLoading();
                renderDetails();
                break;
            case 'notify': showToast(payload?.message, payload?.kind); break;
        }
    });
})();
