import { supabase } from './supabase.js'

const appContainer = document.getElementById('app')
const homeLink = document.getElementById('home-link')

// State
let currentBook = null
let comments = []
let reactions = []

// Utilities
const formatDate = (dateString) => {
  const options = { year: 'numeric', month: 'long', day: 'numeric' }
  return new Date(dateString).toLocaleDateString('ro-RO', options)
}

const escapeHtml = (unsafe) => {
  if (!unsafe) return ''
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

// Initialization
async function init() {
  homeLink.addEventListener('click', (e) => {
    e.preventDefault()
    renderHome()
  })
  
  await renderHome()
}

// --- VIEWS ---

async function renderHome() {
  currentBook = null
  const header = document.getElementById('main-header')
  if (header) header.style.display = 'block'
  
  appContainer.innerHTML = '<div class="loading">Se încarcă cărțile...</div>'
  
  const { data: books, error } = await supabase
    .from('books')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    appContainer.innerHTML = `<div class="error">Eroare la încărcarea cărților: ${error.message}</div>`
    return
  }
  
  if (!books || books.length === 0) {
    appContainer.innerHTML = `
      <div class="empty-state" style="text-align: center; padding: 60px 0;">
        <p class="subtitle">Nicio carte găsită în bibliotecă încă.</p>
        <p>Vă rugăm să rulați schema SQL în proiectul dvs. Supabase.</p>
      </div>`
    return
  }

  let html = '<div class="book-grid">'
  books.forEach(book => {
    const defaultCover = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(book.title) + '&background=eae7e0&color=2C2A29&size=400&font-size=0.15'
    html += `
      <div class="book-card paper-card" data-id="${book.id}">
        <img src="${book.cover_url || defaultCover}" alt="Cover of ${escapeHtml(book.title)}" class="book-cover" onerror="this.src='${defaultCover}'">
        <h3 class="book-title">${escapeHtml(book.title)}</h3>
        <p class="book-author">${escapeHtml(book.author)}</p>
        <p class="book-date">${book.meeting_date ? formatDate(book.meeting_date) : ''}</p>
      </div>
    `
  })
  html += '</div>'
  
  appContainer.innerHTML = html
  
  // Attach events
  document.querySelectorAll('.book-card').forEach(card => {
    card.addEventListener('click', () => {
      const bookId = card.getAttribute('data-id')
      const book = books.find(b => b.id === bookId)
      renderDiscussion(book)
    })
  })
}

async function renderDiscussion(book) {
  currentBook = book
  const header = document.getElementById('main-header')
  if (header) header.style.display = 'none'

  appContainer.innerHTML = '<div class="loading">Se încarcă discuția...</div>'
  
  // Fetch Comments and Reactions simultaneously
  const [commentsRes, reactionsRes] = await Promise.all([
    supabase.from('comments').select('*').eq('book_id', book.id).order('created_at', { ascending: true }),
    // To keep simple, we fetch all reactions for the book's comments. 
    // In a huge app, we'd do this differently.
    supabase.from('reactions').select('*, comments!inner(book_id)').eq('comments.book_id', book.id)
  ])

  comments = commentsRes.data || []
  reactions = reactionsRes.data || []

  // Build the Header
  const defaultCover = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(book.title) + '&background=eae7e0&color=2C2A29&size=400&font-size=0.15'
  
  let html = `
    <button class="back-btn" id="btn-back">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      Înapoi la Bibliotecă
    </button>
    
    <div class="discussion-header">
      <h2 class="discussion-title">${escapeHtml(book.title)}</h2>
      <p class="discussion-meta">de ${escapeHtml(book.author)} &bull; ${book.meeting_date ? formatDate(book.meeting_date) : 'Fără dată'}</p>
    </div>
    
    <div class="discussion-content">
      <h3 class="comments-section-title">Gânduri și Notițe</h3>
      <div class="comments-list" id="comments-container">
        ${renderCommentsTree(null)}
      </div>
      
      <div class="add-comment-form paper-card">
        <h4 style="margin-bottom: 16px;">Adaugă un gând</h4>
        <form id="form-new-comment">
          <div class="form-group">
            <label class="form-label" for="nume">Nume</label>
            <input type="text" id="nume" class="form-input" required placeholder="Numele tău sau un alias">
          </div>
          <div class="form-group">
            <label class="form-label" for="idee">Idee</label>
            <textarea id="idee" class="form-textarea" required placeholder="Împărtășește-ți gândurile despre această carte..."></textarea>
          </div>
          <button type="submit" class="btn-primary" id="btn-submit-comment">Adaugă</button>
        </form>
      </div>
    </div>
  `
  
  appContainer.innerHTML = html

  // Attach events
  document.getElementById('btn-back').addEventListener('click', renderHome)
  
  document.getElementById('form-new-comment').addEventListener('submit', async (e) => {
    e.preventDefault()
    const nameStr = document.getElementById('nume').value.trim()
    const content = document.getElementById('idee').value.trim()
    
    if (!nameStr || !content) return
    
    const btn = document.getElementById('btn-submit-comment')
    btn.textContent = 'Se adaugă...'
    btn.disabled = true
    
    const { data, error } = await supabase.from('comments').insert([
      { book_id: book.id, author_name: nameStr, content: content }
    ]).select()
    
    if (!error && data) {
      comments.push(data[0])
      document.getElementById('nume').value = ''
      document.getElementById('idee').value = ''
      refreshCommentsUI()
    } else {
      alert("Adăugarea a eșuat.")
    }
    btn.textContent = 'Adaugă'
    btn.disabled = false
  })
  
  attachCommentEvents()
}

// --- COMMENTS LOGIC ---

function getReactionsHtml(commentId) {
  const commentReactions = reactions.filter(r => r.comment_id === commentId)
  const reactionCounts = { 'Inimă': 0, 'Dislike': 0, 'Like': 0, 'Surprise': 0 }
  commentReactions.forEach(r => { if (reactionCounts[r.type] !== undefined) reactionCounts[r.type]++ })
  
  const reactionEmojis = { 'Inimă': '❤️', 'Dislike': '👎', 'Like': '👍', 'Surprise': '😲' }
  
  let reactionsHtml = ''
  Object.keys(reactionCounts).forEach(type => {
    const count = reactionCounts[type]
    reactionsHtml += `
      <button class="reaction-btn" data-comment-id="${commentId}" data-type="${type}">
        ${reactionEmojis[type]} ${count > 0 ? `<span style="margin-left:4px;font-size:0.75rem;">${count}</span>` : ''}
      </button>
    `
  })
  return reactionsHtml
}

function renderCommentsTree(parentId) {
  const children = comments.filter(c => c.parent_id === parentId)
  if (children.length === 0) return ''
  
  let html = ''
  children.forEach(c => {
    const hasReplies = comments.some(reply => reply.parent_id === c.id)
    const replyCount = comments.filter(r => r.parent_id === c.id).length
    
    // If we're rendering a top-level comment (parentId === null), its replies are attached to IT (c.id).
    // If we're rendering a reply, any further replies should ACTUALLY attach to its ROOT parent (parentId).
    const replyTargetId = parentId === null ? c.id : parentId;
    
    html += `
      <div class="comment-card paper-card" id="comment-${c.id}">
        <div class="comment-header">
          <span class="comment-author">${escapeHtml(c.author_name)}</span>
          <span class="comment-date">${formatDate(c.created_at)}</span>
        </div>
        <div class="comment-content">${escapeHtml(c.content)}</div>
        
        <div class="comment-actions">
          <div class="reactions-bar">
            ${getReactionsHtml(c.id)}
          </div>
          
          <div style="display: flex; gap: 16px;">
            ${parentId === null && hasReplies ? `
              <button class="reply-toggle-btn" data-comment-id="${c.id}">
                ${replyCount} Răspuns${replyCount === 1 ? '' : 'uri'} <span style="font-size:0.7rem">▼</span>
              </button>
            ` : ''}
          </div>
        </div>

        ${parentId === null ? `
        <div class="replies-container" id="replies-${c.id}">
          ${hasReplies ? renderCommentsTree(c.id) : ''}
        </div>

        <div class="inline-reply-form" id="reply-form-${c.id}">
          <div class="form-group" style="margin-bottom: 8px;">
            <input type="text" id="reply-nume-${c.id}" class="form-input" style="padding: 6px 10px; font-size: 0.9rem;" placeholder="Nume">
          </div>
          <div class="form-group" style="margin-bottom: 8px;">
            <textarea id="reply-idee-${c.id}" class="form-textarea" style="min-height: 50px; padding: 6px 10px; font-size: 0.9rem;" placeholder="Adaugă un răspuns..."></textarea>
          </div>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <button class="btn-primary btn-submit-reply" data-comment-id="${c.id}" style="padding: 6px 12px; font-size: 0.85rem;">Trimite</button>
          </div>
        </div>
        ` : ''}
      </div>
    `
  })
  return html
}

function refreshCommentsUI() {
  document.getElementById('comments-container').innerHTML = renderCommentsTree(null)
  attachCommentEvents()
}

function attachReactionEvent(btn) {
  btn.addEventListener('click', async () => {
    const commentId = btn.getAttribute('data-comment-id')
    const type = btn.getAttribute('data-type')
    
    // Optmistic UI update
    reactions.push({ comment_id: commentId, type: type })
    
    const bar = btn.closest('.reactions-bar')
    if (bar) {
      bar.innerHTML = getReactionsHtml(commentId)
      bar.querySelectorAll('.reaction-btn').forEach(attachReactionEvent)
    }
    
    // Network call
    await supabase.from('reactions').insert([
      { comment_id: commentId, type: type }
    ])
  })
}

function attachCommentEvents() {
  // Toggle replies
  document.querySelectorAll('.reply-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-comment-id')
      const container = document.getElementById(`replies-${id}`)
      if (container) {
        if (container.classList.contains('expanded')) {
          container.classList.remove('expanded')
          container.style.display = 'none'
          btn.innerHTML = btn.innerHTML.replace('▲', '▼')
        } else {
          container.classList.add('expanded')
          container.style.display = 'flex'
          btn.innerHTML = btn.innerHTML.replace('▼', '▲')
        }
      }
    })
  })

  // Submit reply
  document.querySelectorAll('.btn-submit-reply').forEach(btn => {
    btn.addEventListener('click', async () => {
      const parentId = btn.getAttribute('data-comment-id')
      const nameStr = document.getElementById(`reply-nume-${parentId}`).value.trim()
      const content = document.getElementById(`reply-idee-${parentId}`).value.trim()
      
      if (!nameStr || !content) return
      
      btn.textContent = '...'
      btn.disabled = true
      
      const { data, error } = await supabase.from('comments').insert([
        { book_id: currentBook.id, parent_id: parentId, author_name: nameStr, content: content }
      ]).select()
      
      if (!error && data) {
        comments.push(data[0])
        
        // Expand container if not expanded
        const container = document.getElementById(`replies-${parentId}`)
        if (container) {
            container.style.display = 'flex'
            container.classList.add('expanded')
        }
        
        refreshCommentsUI()
      } else {
        alert("Adăugarea răspunsului a eșuat.")
      }
      btn.textContent = 'Răspunde'
      btn.disabled = false
    })
  })
  
  // Reactions
  document.querySelectorAll('.reaction-btn').forEach(attachReactionEvent)
}

// Start app
init()
