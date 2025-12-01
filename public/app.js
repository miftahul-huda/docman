const API_URL = '/api/documents';

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const documentsTableBody = document.querySelector('#documents-table tbody');
const emptyState = document.getElementById('empty-state');
const uploadProgress = document.getElementById('upload-progress');
const progressFill = document.querySelector('.progress-fill');
const editModal = document.getElementById('edit-modal');
const closeModal = document.querySelector('.close-modal');
const saveNoteBtn = document.getElementById('save-note-btn');
const editNoteInput = document.getElementById('edit-note'); // Might be null if replaced by Quill
const editDocIdInput = document.getElementById('edit-doc-id');
const editTitleInput = document.getElementById('edit-title');
const navLinks = document.querySelectorAll('.nav-link');
const views = {
    upload: document.getElementById('view-upload'),
    list: document.getElementById('view-list')
};

// Staging Elements
let stagedFiles = [];
const stagedFilesContainer = document.getElementById('staged-files');
const uploadActions = document.getElementById('upload-actions');
const uploadAllBtn = document.getElementById('upload-all-btn');
const clearStagedBtn = document.getElementById('clear-staged-btn');
const batchMetadataContainer = document.getElementById('batch-metadata');
const batchTitleInput = document.getElementById('batch-title');
// batchNoteInput removed as we use Quill now

// Quill Configuration
const quillConfig = {
    theme: 'snow',
    placeholder: 'Write your note here...',
    modules: {
        toolbar: [
            ['bold', 'italic', 'underline', 'strike'],
            ['blockquote', 'code-block'],
            [{ 'header': 1 }, { 'header': 2 }],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
            [{ 'script': 'sub' }, { 'script': 'super' }],
            [{ 'indent': '-1' }, { 'indent': '+1' }],
            [{ 'direction': 'rtl' }],
            [{ 'size': ['small', false, 'large', 'huge'] }],
            [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
            [{ 'color': [] }, { 'background': [] }],
            [{ 'font': [] }],
            [{ 'align': [] }],
            ['clean']
        ]
    }
};

// Initialize Quills
var quill = new Quill('#editor-container', quillConfig);
var batchQuill = new Quill('#batch-editor-container', quillConfig);

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    fetchDocuments();
    setupNavigation();

    // Event delegation for delete buttons
    documentsTableBody.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            console.log('Delete button clicked for ID:', id);
            await deleteDocument(id);
        }
    });
});

if (uploadAllBtn) uploadAllBtn.addEventListener('click', uploadAllFiles);
if (clearStagedBtn) clearStagedBtn.addEventListener('click', clearStagedFiles);

// Search and Items Per Page Event Listeners
const searchInput = document.getElementById('search-input');
const itemsPerPageSelect = document.getElementById('items-per-page-select');

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        // Debounce search
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchQuery = e.target.value.trim();
            currentPage = 1; // Reset to first page
            fetchDocuments(1);
        }, 300);
    });
}

if (itemsPerPageSelect) {
    itemsPerPageSelect.addEventListener('change', (e) => {
        itemsPerPage = parseInt(e.target.value);
        currentPage = 1; // Reset to first page
        fetchDocuments(1);
    });
}

// Browse Files button
const browseBtn = document.getElementById('browse-btn');
if (browseBtn && fileInput) {
    browseBtn.addEventListener('click', () => {
        fileInput.click();
    });
}

function renderPagination(pagination) {
    const paginationContainer = document.getElementById('pagination-controls');
    if (!paginationContainer) return;

    if (!pagination || pagination.totalPages <= 1) {
        paginationContainer.classList.add('hidden');
        return;
    }

    paginationContainer.classList.remove('hidden');
    paginationContainer.innerHTML = '';

    const { currentPage, totalPages, hasPrevPage, hasNextPage } = pagination;

    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.className = 'pagination-btn';
    prevBtn.textContent = 'Previous';
    prevBtn.disabled = !hasPrevPage;
    prevBtn.onclick = () => fetchDocuments(parseInt(currentPage) - 1);
    paginationContainer.appendChild(prevBtn);

    // Page numbers
    const pageInfo = document.createElement('span');
    pageInfo.className = 'pagination-info';
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    paginationContainer.appendChild(pageInfo);

    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.className = 'pagination-btn';
    nextBtn.textContent = 'Next';
    nextBtn.disabled = !hasNextPage;
    nextBtn.onclick = () => fetchDocuments(parseInt(currentPage) + 1);
    paginationContainer.appendChild(nextBtn);
}

// Fetch and display user profile
async function fetchUserProfile() {
    try {
        const response = await fetch('/api/user');
        if (response.ok) {
            const user = await response.json();
            const profileContainer = document.getElementById('user-profile');
            if (profileContainer && user) {
                profileContainer.innerHTML = `
                    <img src="${user.image}" alt="${user.displayName}" style="width: 32px; height: 32px; border-radius: 50%;">
                    <span style="font-weight: 500; font-size: 0.9rem;">${user.displayName}</span>
                `;
            }
        }
    } catch (error) {
        console.error('Error fetching user profile:', error);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    fetchDocuments();
    fetchUserProfile(); // Fetch user profile
    setupNavigation();

    // Event delegation for delete buttons
    documentsTableBody.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            console.log('Delete button clicked for ID:', id);
            await deleteDocument(id);
        }
    });
});

function setupNavigation() {
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            // Don't prevent default for logout link
            if (link.getAttribute('href') === '/logout') {
                return; // Let the browser handle the navigation
            }
            e.preventDefault();
            const targetView = link.dataset.view;
            switchView(targetView);
        });
    });
}

function switchView(viewName) {
    // Update Nav
    navLinks.forEach(link => {
        if (link.dataset.view === viewName) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    // Update View
    Object.keys(views).forEach(key => {
        if (key === viewName) {
            views[key].classList.remove('hidden');
        } else {
            views[key].classList.add('hidden');
        }
    });

    if (viewName === 'list') {
        fetchDocuments();
    }
}

// Drag & Drop
if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        handleUpload(files);
    });
}

if (fileInput) {
    console.log('File input element found, adding change listener');
    fileInput.addEventListener('change', (e) => {
        console.log('File input changed!');
        const files = e.target.files;
        console.log('Files selected:', files.length);
        handleUpload(files);
    });
} else {
    console.error('File input element not found!');
}

// Modal
if (closeModal) {
    closeModal.addEventListener('click', () => {
        editModal.classList.add('hidden');
    });
}

window.addEventListener('click', (e) => {
    if (e.target === editModal) {
        editModal.classList.add('hidden');
    }
});

if (saveNoteBtn) saveNoteBtn.addEventListener('click', saveNote);

// Pagination state
let currentPage = 1;
let itemsPerPage = 10;
let searchQuery = '';
let searchTimeout = null;

// Functions
async function fetchDocuments(page = 1) {
    try {
        const params = new URLSearchParams({
            page: page,
            limit: itemsPerPage
        });
        if (searchQuery) {
            params.append('search', searchQuery);
        }
        const response = await fetch(`${API_URL}?${params}`);
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }
        const data = await response.json();
        currentPage = page;
        renderDocuments(data.documents);
        renderPagination(data.pagination);
    } catch (error) {
        console.error('Error fetching documents:', error);
    }
}

function renderDocuments(documents) {
    documentsTableBody.innerHTML = '';

    if (!documents || documents.length === 0) {
        emptyState.classList.remove('hidden');
        document.querySelector('.table-container').classList.add('hidden');
        document.getElementById('pagination-controls')?.classList.add('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    document.querySelector('.table-container').classList.remove('hidden');

    documents.forEach(doc => {
        const tr = document.createElement('tr');
        // Strip HTML tags for preview in table
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = doc.note || '';
        const notePreview = tempDiv.textContent || tempDiv.innerText || '';
        const shortNote = notePreview.length > 50 ? notePreview.substring(0, 50) + '...' : (notePreview || '<span style="color: #ccc;">No note</span>');

        // Build files list HTML
        let filesHtml = '';
        if (doc.files && doc.files.length > 0) {
            filesHtml = '<ul class="file-list" style="list-style: none; padding: 0; margin: 0;">';
            doc.files.forEach(file => {
                filesHtml += `
                    <li style="margin-bottom: 5px; display: flex; align-items: center; gap: 8px; font-size: 0.9rem;">
                        <i class="far fa-file" style="color: #666;"></i>
                        <span title="${file.originalName}">${file.originalName}</span>
                        <span style="color: #999; font-size: 0.8rem;">(${formatSize(file.size)})</span>
                        <button class="btn-icon small" onclick='previewFile("${doc._id}", "${file._id}", "${file.originalName}", "${file.driveFileId}")' title="Preview" style="margin-left: auto;">
                            <i class="fas fa-eye"></i>
                        </button>
                        <a href="${API_URL}/download/${doc._id}/${file._id}" class="btn-icon small" title="Download">
                            <i class="fas fa-download"></i>
                        </a>
                    </li>
                `;
            });
            filesHtml += '</ul>';
        } else {
            filesHtml = '<span style="color: #999;">No files</span>';
        }

        tr.innerHTML = `
            <td style="vertical-align: top;">
                <div style="display: flex; flex-direction: column; gap: 5px;">
                    <span style="font-weight: 600; font-size: 1.1rem; color: var(--primary-color); cursor: pointer;" 
                          onclick='showDocumentDetails(${JSON.stringify(doc)})'>${doc.title || 'Untitled'}</span>
                    <div style="font-size: 0.9rem; color: #666;">${shortNote}</div>
                </div>
            </td>
            <td style="vertical-align: top;">
                ${filesHtml}
            </td>
            <td style="vertical-align: top;">${new Date(doc.uploadDate).toLocaleDateString()}</td>
            <td style="vertical-align: top;">
                <button class="btn-icon" onclick='openEditModal("${doc._id}", ${JSON.stringify(doc.note || "")}, "${doc.title || "Untitled"}")' title="Edit">
                    <i class="fas fa-pen"></i>
                </button>
                <button class="btn-icon delete-btn" data-id="${doc._id}" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        documentsTableBody.appendChild(tr);
    });
}

function handleUpload(files) {
    console.log('handleUpload called with files:', files);
    if (files.length === 0) {
        console.log('No files to upload');
        return;
    }

    console.log(`Adding ${files.length} files to staged files`);
    // Add new files to stagedFiles array
    for (let i = 0; i < files.length; i++) {
        stagedFiles.push({
            file: files[i]
        });
    }

    console.log('Calling renderStagedFiles...');
    renderStagedFiles();
}

function renderStagedFiles() {
    stagedFilesContainer.innerHTML = '';

    if (stagedFiles.length === 0) {
        stagedFilesContainer.classList.add('hidden');
        uploadActions.classList.add('hidden');
        batchMetadataContainer.classList.add('hidden');
        dropZone.classList.remove('hidden'); // Show drop zone
        return;
    }

    stagedFilesContainer.classList.remove('hidden');
    uploadActions.classList.remove('hidden');
    batchMetadataContainer.classList.remove('hidden');
    dropZone.classList.add('hidden'); // Hide drop zone

    stagedFiles.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'staged-file-card';
        // Simplified card without inputs
        card.innerHTML = `
            <div class="staged-file-header" style="border-bottom: none; padding-bottom: 0;">
                <span class="staged-file-name">${item.file.name} (${formatSize(item.file.size)})</span>
                <button class="btn-icon delete" onclick="removeStagedFile(${index})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        stagedFilesContainer.appendChild(card);
    });
}

window.removeStagedFile = (index) => {
    stagedFiles.splice(index, 1);
    renderStagedFiles();
};

function clearStagedFiles() {
    stagedFiles = [];
    batchTitleInput.value = '';
    batchQuill.root.innerHTML = ''; // Clear Quill
    renderStagedFiles();
    if (fileInput) fileInput.value = ''; // Reset input
}

async function uploadAllFiles() {
    if (stagedFiles.length === 0) return;

    const formData = new FormData();

    const batchTitle = batchTitleInput.value;
    const batchNote = batchQuill.root.innerHTML; // Get from Quill

    stagedFiles.forEach(item => {
        formData.append('files', item.file);
    });

    // Send single metadata object for the whole batch
    const metadata = {
        title: batchTitle,
        note: batchNote
    };

    formData.append('metadata', JSON.stringify(metadata));

    uploadProgress.classList.remove('hidden');
    progressFill.style.width = '0%';
    uploadActions.classList.add('hidden'); // Hide actions during upload

    // Simulate progress
    let progress = 0;
    const interval = setInterval(() => {
        progress += 10;
        if (progress > 90) clearInterval(interval);
        progressFill.style.width = `${progress}%`;
    }, 100);

    try {
        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            progressFill.style.width = '100%';
            setTimeout(() => {
                uploadProgress.classList.add('hidden');
                progressFill.style.width = '0%';
                clearStagedFiles();
                switchView('list');
            }, 500);
        } else {
            const errorData = await response.json();
            if (response.status === 401 && errorData.code === 'MISSING_REFRESH_TOKEN') {
                showAlert('Google Drive access expired. Redirecting to login...', 'warning');
                window.location.href = '/auth/google?force=true';
                return;
            }
            showAlert(`Upload failed: ${errorData.message || 'Unknown error'}`, 'error');
            uploadProgress.classList.add('hidden');
            uploadActions.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error uploading:', error);
        showAlert('Error uploading files', 'error');
        uploadProgress.classList.add('hidden');
        uploadActions.classList.remove('hidden');
    } finally {
        clearInterval(interval);
    }
}

function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

window.openEditModal = (id, currentNote, currentTitle) => {
    editDocIdInput.value = id;
    editTitleInput.value = currentTitle;
    // Set content to Quill
    quill.root.innerHTML = currentNote;
    editModal.classList.remove('hidden');
};

async function saveNote() {
    const id = editDocIdInput.value;
    const note = quill.root.innerHTML;
    const title = editTitleInput.value;

    try {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ note, title })
        });

        if (response.ok) {
            editModal.classList.add('hidden');
            fetchDocuments();
        } else {
            showAlert('Failed to update document', 'error');
        }
    } catch (error) {
        console.error('Error updating document:', error);
    }
}

// Delete Modal Elements
const deleteModal = document.getElementById('delete-modal');
const closeDeleteModal = document.getElementById('close-delete-modal');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
let documentToDeleteId = null;

// Delete Modal Event Listeners
if (closeDeleteModal) {
    closeDeleteModal.addEventListener('click', () => {
        deleteModal.classList.add('hidden');
        documentToDeleteId = null;
    });
}

if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener('click', () => {
        deleteModal.classList.add('hidden');
        documentToDeleteId = null;
    });
}

if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', async () => {
        if (documentToDeleteId) {
            await performDelete(documentToDeleteId);
            deleteModal.classList.add('hidden');
            documentToDeleteId = null;
        }
    });
}

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    if (e.target === deleteModal) {
        deleteModal.classList.add('hidden');
        documentToDeleteId = null;
    }
});

// Trigger Delete Modal
window.deleteDocument = (id) => {
    documentToDeleteId = id;
    deleteModal.classList.remove('hidden');
};

async function performDelete(id) {
    try {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            fetchDocuments();
        } else {
            showAlert('Failed to delete document', 'error');
        }
    } catch (error) {
        console.error('Error deleting document:', error);
    }
}

// Custom Alert Modal
const alertModal = document.getElementById('alert-modal');
const alertIcon = document.getElementById('alert-icon');
const alertMessage = document.getElementById('alert-message');
const alertOkBtn = document.getElementById('alert-ok-btn');
const closeAlertModal = document.getElementById('close-alert-modal');

function showAlert(message, type = 'info') {
    // Set icon based on type
    alertIcon.className = 'fas';
    switch (type) {
        case 'error':
            alertIcon.classList.add('fa-exclamation-circle', 'error');
            break;
        case 'success':
            alertIcon.classList.add('fa-check-circle', 'success');
            break;
        case 'warning':
            alertIcon.classList.add('fa-exclamation-triangle', 'warning');
            break;
        default:
            alertIcon.classList.add('fa-info-circle', 'info');
    }

    alertMessage.textContent = message;
    alertModal.classList.remove('hidden');
}

function closeAlert() {
    alertModal.classList.add('hidden');
}

if (alertOkBtn) alertOkBtn.addEventListener('click', closeAlert);
if (closeAlertModal) closeAlertModal.addEventListener('click', closeAlert);

window.addEventListener('click', (e) => {
    if (e.target === alertModal) closeAlert();
});

// File Preview Modal
const previewModal = document.getElementById('preview-modal');
const previewTitle = document.getElementById('preview-title');
const previewContainer = document.getElementById('preview-container');
const closePreviewModal = document.getElementById('close-preview-modal');

window.previewFile = async (docId, fileId, fileName, driveFileId) => {
    previewTitle.textContent = fileName;
    previewContainer.innerHTML = '<p style="text-align: center; padding: 40px;">Loading preview...</p>';
    previewModal.classList.remove('hidden');

    const extension = fileName.split('.').pop().toLowerCase();
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    const textExtensions = ['txt', 'md', 'json', 'xml', 'csv', 'log'];

    if (imageExtensions.includes(extension)) {
        // Preview images directly
        previewContainer.innerHTML = `<img src="${API_URL}/download/${docId}/${fileId}" alt="${fileName}">`;
    } else if (extension === 'pdf' || ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(extension)) {
        // Use Google Drive viewer for PDFs and Office docs
        const viewerUrl = `https://drive.google.com/file/d/${driveFileId}/preview`;
        previewContainer.innerHTML = `<iframe src="${viewerUrl}" allow="autoplay"></iframe>`;
    } else if (textExtensions.includes(extension)) {
        // Fetch and display text files
        try {
            const response = await fetch(`${API_URL}/download/${docId}/${fileId}`);
            const text = await response.text();
            previewContainer.innerHTML = `<pre>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
        } catch (error) {
            previewContainer.innerHTML = '<p style="text-align: center; padding: 40px; color: #ff6b6b;">Failed to load preview</p>';
        }
    } else {
        previewContainer.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <i class="fas fa-file" style="font-size: 4rem; color: #ccc; margin-bottom: 20px;"></i>
                <p>Preview not available for this file type.</p>
                <a href="${API_URL}/download/${docId}/${fileId}" class="btn-primary" style="display: inline-block; margin-top: 20px; text-decoration: none;">Download File</a>
            </div>
        `;
    }
};

function closePreview() {
    previewModal.classList.add('hidden');
    previewContainer.innerHTML = '';
}

if (closePreviewModal) closePreviewModal.addEventListener('click', closePreview);

window.addEventListener('click', (e) => {
    if (e.target === previewModal) closePreview();
});

// Document Details Modal
const documentDetailsModal = document.getElementById('document-details-modal');
const documentDetailsTitle = document.getElementById('document-details-title');
const documentDetailsNote = document.getElementById('document-details-note');
const documentDetailsFiles = document.getElementById('document-details-files');
const closeDocumentDetailsModal = document.getElementById('close-document-details-modal');

let currentDocumentId = null;

window.showDocumentDetails = (doc) => {
    currentDocumentId = doc._id;
    documentDetailsTitle.textContent = doc.title || 'Untitled';
    documentDetailsNote.innerHTML = doc.note || '<p style="color: #999;">No note</p>';

    // Render files list
    let filesHtml = '';
    if (doc.files && doc.files.length > 0) {
        filesHtml = '<div style="display: flex; flex-direction: column; gap: 10px;">';
        doc.files.forEach(file => {
            filesHtml += `
                <div style="display: flex; align-items: center; gap: 10px; padding: 12px; background: white; border-radius: 8px; border: 1px solid #eee;">
                    <i class="far fa-file" style="font-size: 1.5rem; color: #666;"></i>
                    <div style="flex: 1;">
                        <div style="font-weight: 500;">${file.originalName}</div>
                        <div style="font-size: 0.85rem; color: #999;">${formatSize(file.size)}</div>
                    </div>
                    <button class="btn-icon" onclick='previewFile("${doc._id}", "${file._id}", "${file.originalName}", "${file.driveFileId}")' title="Preview">
                        <i class="fas fa-eye"></i>
                    </button>
                    <a href="${API_URL}/download/${doc._id}/${file._id}" class="btn-icon" title="Download">
                        <i class="fas fa-download"></i>
                    </a>
                    <button class="btn-icon delete" onclick='removeFile("${doc._id}", "${file._id}", "${file.originalName}")' title="Remove">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        });
        filesHtml += '</div>';
    } else {
        filesHtml = '<p style="color: #999; text-align: center; padding: 20px;">No files</p>';
    }

    documentDetailsFiles.innerHTML = filesHtml;
    documentDetailsModal.classList.remove('hidden');
};

function closeDocumentDetails() {
    documentDetailsModal.classList.add('hidden');
    currentDocumentId = null;
}

if (closeDocumentDetailsModal) closeDocumentDetailsModal.addEventListener('click', closeDocumentDetails);

window.addEventListener('click', (e) => {
    if (e.target === documentDetailsModal) closeDocumentDetails();
});

// Remove file from document
window.removeFile = async (docId, fileId, fileName) => {
    if (!confirm(`Are you sure you want to remove "${fileName}"?`)) return;

    try {
        const response = await fetch(`${API_URL}/${docId}/files/${fileId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showAlert('File removed successfully', 'success');
            // Refresh the document details
            const docResponse = await fetch(`${API_URL}/${docId}`);
            if (docResponse.ok) {
                const doc = await docResponse.json();
                showDocumentDetails(doc);
            }
            // Refresh the main list
            fetchDocuments();
        } else {
            showAlert('Failed to remove file', 'error');
        }
    } catch (error) {
        console.error('Error removing file:', error);
        showAlert('Error removing file', 'error');
    }
};
