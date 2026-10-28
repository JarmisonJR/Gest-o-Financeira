// --- CONFIGURAÇÃO DO FIREBASE ---
// Cole abaixo as chaves obtidas no Firebase Console (Passo 1)
const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_SENDER_ID",
  appId: "SEU_APP_ID"
};

// Inicializa Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// --- ESTADO DO APP ---
let currentUser = null;
let userProfile = null;
let registeredUsers = [];
let isRegisterMode = true;
let activeTab = 'dashboard';
let isPrivate = false;

let sharedData = {
  investments: [],
  caixinhas: [],
  expenses: [],
  goals: []
};

// --- MENSAGEM TOAST ---
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast-message');
  const text = document.getElementById('toast-text');
  text.innerText = message;
  toast.className = `toast ${type}`;
  setTimeout(() => { toast.classList.add('hidden'); }, 3000);
}

// --- ESCUTAR AUTENTICAÇÃO EM TEMPO REAL ---
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    // Buscar perfil do usuário no Firestore
    const userDoc = await db.collection('users').doc(user.uid).get();
    if (userDoc.exists) {
      userProfile = userDoc.data();
    } else {
      userProfile = { name: user.email.split('@')[0], color: 'u1', avatar: 'U' };
    }

    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('current-avatar').innerText = userProfile.name.charAt(0).toUpperCase();
    document.getElementById('current-username').innerText = userProfile.name;

    // Iniciar escutadores de banco de dados em tempo real
    subscribeToDatabase();
  } else {
    currentUser = null;
    userProfile = null;
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
  }
});

// ESCUTA EM TEMPO REAL DAS COLEÇÕES DO FIRESTORE
function subscribeToDatabase() {
  // Lista de usuários para atribuição de cores/nomes
  db.collection('users').onSnapshot(snapshot => {
    registeredUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    render();
  });

  // Escutar investimentos, caixinhas, gastos e metas
  ['investments', 'caixinhas', 'expenses', 'goals'].forEach(collectionName => {
    db.collection(collectionName).onSnapshot(snapshot => {
      sharedData[collectionName] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      render();
    });
  });
}

// --- AUTENTICAÇÃO (LOGIN / CADASTRO) ---
function toggleAuthMode() {
  isRegisterMode = !isRegisterMode;
  const subtitle = document.getElementById('auth-subtitle');
  const nameGroup = document.getElementById('name-field-group');
  const submitBtn = document.getElementById('auth-submit-btn');
  const switchText = document.getElementById('auth-switch-text');
  const switchBtn = document.querySelector('.link-btn');

  if (isRegisterMode) {
    subtitle.innerText = 'Cadastre-se para acessar sua conta';
    nameGroup.style.display = 'flex';
    submitBtn.innerText = 'Cadastrar';
    switchText.innerText = 'Já tem uma conta?';
    switchBtn.innerText = 'Fazer Login';
  } else {
    subtitle.innerText = 'Entre com seus dados';
    nameGroup.style.display = 'none';
    submitBtn.innerText = 'Entrar';
    switchText.innerText = 'Não tem uma conta?';
    switchBtn.innerText = 'Cadastre-se';
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('auth-user').value.trim();
  const pass = document.getElementById('auth-pass').value.trim();
  const name = document.getElementById('auth-name').value.trim();

  try {
    if (isRegisterMode) {
      if (!name) {
        showToast('Por favor, informe seu nome.', 'error');
        return;
      }
      // Criar conta no Firebase Auth
      const userCredential = await auth.createUserWithEmailAndPassword(email, pass);
      const user = userCredential.user;

      // Definir cor (u1 para o primeiro, u2 para o segundo)
      const usersSnapshot = await db.collection('users').get();
      const color = usersSnapshot.size === 0 ? 'u1' : 'u2';

      // Salvar perfil do usuário no Firestore
      await db.collection('users').doc(user.uid).set({
        name: name,
        email: email,
        color: color,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      await auth.signOut(); // Desloga para enviar à tela de login
      showToast('Conta criada com sucesso! Faça login.', 'success');
      document.getElementById('auth-form').reset();
      toggleAuthMode();

    } else {
      // Login
      await auth.signInWithEmailAndPassword(email, pass);
      showToast('Login realizado com sucesso!', 'success');
    }
  } catch (error) {
    let msg = 'Erro ao processar autenticação.';
    if (error.code === 'auth/email-already-in-use') msg = 'E-mail já está em uso!';
    if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') msg = 'E-mail ou senha incorretos!';
    if (error.code === 'auth/weak-password') msg = 'A senha deve ter no mínimo 6 caracteres.';
    showToast(msg, 'error');
  }
}

function logout() {
  auth.signOut().then(() => {
    showToast('Sessão encerrada.', 'success');
  });
}

// --- UTILITÁRIOS ---
function formatCurrency(val) {
  if (isPrivate) return '••••••';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeBtn = document.getElementById(`nav-${tab}`);
  if (activeBtn) activeBtn.classList.add('active');
  render();
}

function togglePrivacy() {
  isPrivate = !isPrivate;
  const btn = document.getElementById('privacy-btn');
  btn.innerHTML = `<i data-lucide="${isPrivate ? 'eye-off' : 'eye'}"></i>`;
  lucide.createIcons();
  render();
}

function getUserInfo(userId) {
  const user = registeredUsers.find(u => u.id === userId);
  return user || { name: 'Participante', color: 'u1' };
}

// --- RENDERIZADORES DE TELA ---
function render() {
  const container = document.getElementById('main-content');
  if (!container) return;
  container.innerHTML = '';

  if (activeTab === 'dashboard') renderDashboard(container);
  else if (activeTab === 'investments') renderInvestments(container);
  else if (activeTab === 'caixinhas') renderCaixinhas(container);
  else if (activeTab === 'expenses') renderExpenses(container);
  else if (activeTab === 'goals') renderGoals(container);
  else if (activeTab === 'calc') renderCalculator(container);

  lucide.createIcons();
}

// 1. DASHBOARD
function renderDashboard(container) {
  const totalInv = sharedData.investments.reduce((acc, i) => acc + (i.amount || 0), 0);
  const totalCaix = sharedData.caixinhas.reduce((acc, c) => acc + (c.current || 0), 0);
  const totalExp = sharedData.expenses.reduce((acc, e) => acc + (e.amount || 0), 0);
  const totalNet = totalInv + totalCaix;

  const getSubtotal = (list, field) => {
    return list.reduce((acc, item) => {
      acc[item.owner] = (acc[item.owner] || 0) + (item[field] || 0);
      return acc;
    }, {});
  };

  const invUsers = getSubtotal(sharedData.investments, 'amount');
  const caixUsers = getSubtotal(sharedData.caixinhas, 'current');

  let u1 = registeredUsers[0];
  let u2 = registeredUsers[1];
  let u1Name = u1 ? u1.name : 'Participante 1';
  let u2Name = u2 ? u2.name : 'Participante 2';
  let u1Total = (u1 ? (invUsers[u1.id] || 0) + (caixUsers[u1.id] || 0) : 0);
  let u2Total = (u2 ? (invUsers[u2.id] || 0) + (caixUsers[u2.id] || 0) : 0);

  container.innerHTML = `
    <div class="card">
      <div class="card-title">Patrimônio Consolidado Total</div>
      <div class="card-value">${formatCurrency(totalNet)}</div>
      <div class="user-breakdown">
        <div style="display: flex; justify-content: space-between;">
          <span>${u1Name}: ${formatCurrency(u1Total)}</span>
          <span>${u2Name}: ${formatCurrency(u2Total)}</span>
        </div>
        <div class="breakdown-bar">
          <div class="bar-u1" style="width: ${totalNet ? (u1Total/totalNet)*100 : 50}%"></div>
          <div class="bar-u2" style="width: ${totalNet ? (u2Total/totalNet)*100 : 50}%"></div>
        </div>
      </div>
    </div>

    <div class="card-grid">
      <div class="card">
        <div class="card-title">Investimentos</div>
        <div class="card-value" style="font-size: 1.2rem;">${formatCurrency(totalInv)}</div>
      </div>
      <div class="card">
        <div class="card-title">Caixinhas</div>
        <div class="card-value" style="font-size: 1.2rem;">${formatCurrency(totalCaix)}</div>
      </div>
    </div>

    <div class="card" style="border-left: 4px solid var(--danger);">
      <div class="card-title">Gastos Registrados</div>
      <div class="card-value">${formatCurrency(totalExp)}</div>
    </div>
  `;
}

// 2. INVESTIMENTOS
function renderInvestments(container) {
  let html = `
    <div class="section-header">
      <h2>Investimentos</h2>
      <button class="add-btn" onclick="openModal('investment')">
        <i data-lucide="plus"></i> Novo
      </button>
    </div>
    <div class="item-list">
  `;

  if (sharedData.investments.length === 0) {
    html += `<div style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum investimento cadastrado.</div>`;
  }

  sharedData.investments.forEach(item => {
    const ownerInfo = getUserInfo(item.owner);
    const isOwner = currentUser && item.owner === currentUser.uid;
    html += `
      <div class="item-card">
        <div class="item-info">
          <span class="item-title">${item.name}</span>
          <span class="item-sub">${item.type} • <span class="owner-badge badge-${ownerInfo.color}">${ownerInfo.name}</span></span>
        </div>
        <div class="item-right">
          <div class="item-amount">${formatCurrency(item.amount)}</div>
          <div class="actions">
            ${isOwner ? `
              <button class="action-btn delete" onclick="deleteItem('investments', '${item.id}')"><i data-lucide="trash-2"></i></button>
            ` : `
              <button class="action-btn disabled" title="Apenas o proprietário pode alterar"><i data-lucide="lock"></i></button>
            `}
          </div>
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

// 3. CAIXINHAS
function renderCaixinhas(container) {
  let html = `
    <div class="section-header">
      <h2>Caixinhas</h2>
      <button class="add-btn" onclick="openModal('caixinha')">
        <i data-lucide="plus"></i> Nova
      </button>
    </div>
    <div class="item-list">
  `;

  if (sharedData.caixinhas.length === 0) {
    html += `<div style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhuma caixinha cadastrada.</div>`;
  }

  sharedData.caixinhas.forEach(item => {
    const ownerInfo = getUserInfo(item.owner);
    const isOwner = currentUser && item.owner === currentUser.uid;
    const progress = Math.min(100, Math.round((item.current / item.target) * 100));
    html += `
      <div class="item-card" style="flex-direction: column; align-items: stretch; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span class="item-title">${item.name}</span>
            <span class="owner-badge badge-${ownerInfo.color}" style="margin-left: 6px;">${ownerInfo.name}</span>
          </div>
          <div class="actions">
            ${isOwner ? `
              <button class="action-btn delete" onclick="deleteItem('caixinhas', '${item.id}')"><i data-lucide="trash-2"></i></button>
            ` : `<button class="action-btn disabled"><i data-lucide="lock"></i></button>`}
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
          <span>Guardado: <b>${formatCurrency(item.current)}</b></span>
          <span style="color: var(--text-muted);">Meta: ${formatCurrency(item.target)}</span>
        </div>
        <div class="progress-container">
          <div class="progress-fill" style="width: ${progress}%;"></div>
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

// 4. GASTOS
function renderExpenses(container) {
  let html = `
    <div class="section-header">
      <h2>Gastos e Despesas</h2>
      <button class="add-btn" onclick="openModal('expense')">
        <i data-lucide="plus"></i> Novo
      </button>
    </div>
    <div class="item-list">
  `;

  if (sharedData.expenses.length === 0) {
    html += `<div style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum gasto registrado.</div>`;
  }

  sharedData.expenses.forEach(item => {
    const ownerInfo = getUserInfo(item.owner);
    const isOwner = currentUser && item.owner === currentUser.uid;
    html += `
      <div class="item-card">
        <div class="item-info">
          <span class="item-title">${item.name}</span>
          <span class="item-sub">${item.category} • <span class="owner-badge badge-${ownerInfo.color}">${ownerInfo.name}</span></span>
        </div>
        <div class="item-right">
          <div class="item-amount" style="color: var(--danger);">${formatCurrency(item.amount)}</div>
          <div class="actions">
            ${isOwner ? `
              <button class="action-btn delete" onclick="deleteItem('expenses', '${item.id}')"><i data-lucide="trash-2"></i></button>
            ` : `<button class="action-btn disabled"><i data-lucide="lock"></i></button>`}
          </div>
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

// 5. METAS
function renderGoals(container) {
  let html = `
    <div class="section-header">
      <h2>Metas Compartilhadas</h2>
      <button class="add-btn" onclick="openModal('goal')">
        <i data-lucide="plus"></i> Nova
      </button>
    </div>
    <div class="item-list">
  `;

  if (sharedData.goals.length === 0) {
    html += `<div style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhuma meta cadastrada.</div>`;
  }

  sharedData.goals.forEach(item => {
    const ownerInfo = getUserInfo(item.owner);
    const isOwner = currentUser && item.owner === currentUser.uid;
    html += `
      <div class="item-card">
        <div class="item-info">
          <span class="item-title">${item.title}</span>
          <span class="item-sub">Até ${item.deadline} • <span class="owner-badge badge-${ownerInfo.color}">${ownerInfo.name}</span></span>
        </div>
        <div class="item-right">
          <span class="item-amount">${formatCurrency(item.targetAmount)}</span>
          <div class="actions">
            ${isOwner ? `
              <button class="action-btn delete" onclick="deleteItem('goals', '${item.id}')"><i data-lucide="trash-2"></i></button>
            ` : `<button class="action-btn disabled"><i data-lucide="lock"></i></button>`}
          </div>
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

// 6. CALCULADORA DE JUROS COMPOSTOS
function renderCalculator(container) {
  container.innerHTML = `
    <div class="section-header">
      <h2>Cálculos de Investimento</h2>
    </div>
    <div class="card">
      <div class="form-group">
        <label>Aporte Inicial (R$)</label>
        <input type="number" id="calc-initial" value="1000">
      </div>
      <div class="form-group">
        <label>Aporte Mensal (R$)</label>
        <input type="number" id="calc-monthly" value="500">
      </div>
      <div class="form-group">
        <label>Taxa de Juros Anual (%)</label>
        <input type="number" id="calc-rate" value="12" step="0.1">
      </div>
      <div class="form-group">
        <label>Tempo (Anos)</label>
        <input type="number" id="calc-years" value="5">
      </div>
      <button class="btn-primary" style="width: 100%; margin-top: 10px;" onclick="calculateInvestment()">Calcular</button>

      <div id="calc-result" class="calc-card-result hidden"></div>
    </div>
  `;
}

function calculateInvestment() {
  const initial = parseFloat(document.getElementById('calc-initial').value) || 0;
  const monthly = parseFloat(document.getElementById('calc-monthly').value) || 0;
  const annualRate = parseFloat(document.getElementById('calc-rate').value) || 0;
  const years = parseInt(document.getElementById('calc-years').value) || 0;

  const months = years * 12;
  const monthlyRate = Math.pow(1 + annualRate / 100, 1 / 12) - 1;

  let totalInvested = initial;
  let totalAmount = initial;

  for (let i = 0; i < months; i++) {
    totalAmount = totalAmount * (1 + monthlyRate) + monthly;
    totalInvested += monthly;
  }

  const interestGained = totalAmount - totalInvested;
  const resultDiv = document.getElementById('calc-result');

  resultDiv.classList.remove('hidden');
  resultDiv.innerHTML = `
    <div style="font-size: 0.8rem; color: var(--text-muted);">Valor Total Acumulado</div>
    <div class="card-value" style="color: var(--primary); font-size: 1.4rem;">${formatCurrency(totalAmount)}</div>
    <div style="margin-top: 8px; font-size: 0.85rem; display: flex; justify-content: space-between;">
      <span>Total Investido:</span> <b>${formatCurrency(totalInvested)}</b>
    </div>
    <div style="font-size: 0.85rem; display: flex; justify-content: space-between;">
      <span>Rendimento em Juros:</span> <b style="color: var(--primary);">${formatCurrency(interestGained)}</b>
    </div>
  `;
}

// --- MODAIS E OPERAÇÕES FIRESTORE (CRUD) ---
let currentModalType = null;

function openModal(type) {
  currentModalType = type;
  const modal = document.getElementById('modal-container');
  const title = document.getElementById('modal-title');
  const fields = document.getElementById('modal-fields');

  modal.classList.remove('hidden');

  if (type === 'investment') {
    title.innerText = 'Adicionar Investimento';
    fields.innerHTML = `
      <div class="form-group"><label>Nome</label><input type="text" id="m-name" required></div>
      <div class="form-group">
        <label>Tipo</label>
        <select id="m-type">
          <option>Renda Fixa</option><option>Ações</option><option>FIIs</option><option>Cripto</option>
        </select>
      </div>
      <div class="form-group"><label>Valor (R$)</label><input type="number" id="m-amount" step="0.01" required></div>
    `;
  } else if (type === 'caixinha') {
    title.innerText = 'Nova Caixinha';
    fields.innerHTML = `
      <div class="form-group"><label>Nome da Caixinha</label><input type="text" id="m-name" required></div>
      <div class="form-group"><label>Valor Guardado Atual (R$)</label><input type="number" id="m-current" step="0.01" required></div>
      <div class="form-group"><label>Meta Total (R$)</label><input type="number" id="m-target" step="0.01" required></div>
    `;
  } else if (type === 'expense') {
    title.innerText = 'Novo Gasto';
    fields.innerHTML = `
      <div class="form-group"><label>Descrição</label><input type="text" id="m-name" required></div>
      <div class="form-group"><label>Categoria</label><input type="text" id="m-cat" placeholder="Ex: Alimentação" required></div>
      <div class="form-group"><label>Valor (R$)</label><input type="number" id="m-amount" step="0.01" required></div>
    `;
  } else if (type === 'goal') {
    title.innerText = 'Nova Meta';
    fields.innerHTML = `
      <div class="form-group"><label>Título da Meta</label><input type="text" id="m-title" required></div>
      <div class="form-group"><label>Valor Alvo (R$)</label><input type="number" id="m-target" step="0.01" required></div>
      <div class="form-group"><label>Data Limite</label><input type="month" id="m-date" required></div>
    `;
  }
}

function closeModal() {
  document.getElementById('modal-container').classList.add('hidden');
}

async function handleFormSubmit(e) {
  e.preventDefault();
  if (!currentUser) return;

  try {
    if (currentModalType === 'investment') {
      await db.collection('investments').add({
        owner: currentUser.uid,
        name: document.getElementById('m-name').value,
        type: document.getElementById('m-type').value,
        amount: parseFloat(document.getElementById('m-amount').value),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else if (currentModalType === 'caixinha') {
      await db.collection('caixinhas').add({
        owner: currentUser.uid,
        name: document.getElementById('m-name').value,
        current: parseFloat(document.getElementById('m-current').value),
        target: parseFloat(document.getElementById('m-target').value),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else if (currentModalType === 'expense') {
      await db.collection('expenses').add({
        owner: currentUser.uid,
        name: document.getElementById('m-name').value,
        category: document.getElementById('m-cat').value,
        amount: parseFloat(document.getElementById('m-amount').value),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else if (currentModalType === 'goal') {
      await db.collection('goals').add({
        owner: currentUser.uid,
        title: document.getElementById('m-title').value,
        targetAmount: parseFloat(document.getElementById('m-target').value),
        deadline: document.getElementById('m-date').value,
        completed: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    closeModal();
    showToast('Item salvo no banco com sucesso!', 'success');
  } catch (err) {
    showToast('Erro ao salvar no banco de dados.', 'error');
  }
}

async function deleteItem(collection, id) {
  try {
    await db.collection(collection).doc(id).delete();
    showToast('Item removido com sucesso!', 'success');
  } catch (err) {
    showToast('Erro ao remover item.', 'error');
  }
}
