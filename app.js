document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');
    const uploadContent = document.getElementById('upload-content');
    const previewContent = document.getElementById('preview-content');
    const imagePreview = document.getElementById('image-preview');
    const removeBtn = document.getElementById('remove-btn');
    const verifyBtn = document.getElementById('verify-btn');
    const showFormBtn = document.getElementById('show-form-btn');
    const apiForm = document.getElementById('api-form');
    const ocrLoading = document.getElementById('ocr-loading');
    
    // State Containers
    const resultsCard = document.getElementById('results-card');
    const stateEmpty = document.getElementById('empty-state');
    const stateLoading = document.getElementById('loading-state');
    const stateSuccess = document.getElementById('success-state');
    const stateError = document.getElementById('error-state');
    const progressBar = document.getElementById('progress-bar');
    
    let currentFile = null;

    // Trigger file selection
    browseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
    });

    // Handle Drag & Drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            if(!currentFile) dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('dragover');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    });

    // Handle File Input Change
    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        if (files.length === 0) return;
        
        const file = files[0];
        
        // Ensure it's an image
        if (!file.type.match('image.*')) {
            alert('Please upload an image file (JPG, PNG, WEBP).');
            return;
        }

        currentFile = file;
        
        // Show Preview
        const reader = new FileReader();
        reader.onload = async (e) => {
            imagePreview.src = e.target.result;
            uploadContent.classList.add('hidden');
            previewContent.classList.remove('hidden');
            
            // Show OCR Loading
            ocrLoading.classList.remove('hidden');
            showFormBtn.disabled = true;
            verifyBtn.disabled = true;
            
            try {
                // Send Base64 image to our Backend Proxy which uses Gemini 2.5 Flash
                const response = await fetch('http://localhost:3000/api/extract', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageBase64: e.target.result })
                });

                if (!response.ok) throw new Error('Failed to extract data via proxy');
                
                const data = await response.json();
                console.log("Gemini AI Extracted Data:", data);

                // Auto-fill form with Gemini structured JSON output
                if (data.referencia) document.getElementById('referencia').value = data.referencia;
                if (data.importe) document.getElementById('importe').value = data.importe;
                if (data.fechaPago) document.getElementById('fechaPago').value = data.fechaPago;
                if (data.cedulaPagador) document.getElementById('cedulaPagador').value = data.cedulaPagador;
                if (data.telefonoPagador) document.getElementById('telefonoPagador').value = data.telefonoPagador;
                if (data.telefonoDestino) document.getElementById('telefonoDestino').value = data.telefonoDestino;
                if (data.bancoOrigen) document.getElementById('bancoOrigen').value = data.bancoOrigen;
                
                // Trigger input event manually so checkFormValidity picks it up
                formInputs.forEach(i => i.dispatchEvent(new Event('input')));

            } catch (err) {
                console.error("Advanced OCR Error:", err);
                // Fallback to basic Tesseract if Gemini fails
                console.log("Falling back to local Tesseract OCR...");
                try {
                     const worker = await Tesseract.createWorker('spa');
                     const ret = await worker.recognize(file);
                     const text = ret.data.text;
                     await worker.terminate();
                     autoFillForm(text);
                } catch(tessErr) {
                     console.error("Fallback OCR Error:", tessErr);
                }
            } finally {
                // Hide OCR loading
                ocrLoading.classList.add('hidden');
                showFormBtn.disabled = false;
                
                // Auto-open the form to prompt user to verify/input details
                apiForm.classList.remove('hidden');
                showFormBtn.innerHTML = '<i data-lucide="chevron-up"></i> Hide Form';
                lucide.createIcons();
                
                checkFormValidity();
            }
        };
        reader.readAsDataURL(file);
        
        // Reset state to empty if we upload a new one
        hideAllStates();
        stateEmpty.classList.remove('hidden');
    }

    // Heuristics to auto-fill form data from OCR text (Fallback)
    function autoFillForm(text) {
        // Normalize text for easier matching
        const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ');
        console.log("Cleaned Text for Regex:", cleanText);

        // Find Reference ("Operación:", "Ref:", "Referencia:")
        const refMatch = cleanText.match(/(?:operaci[oó]n|ref|referencia)[\s:.-]*(\d{6,15})/i) || cleanText.match(/(\d{6,15})/);
        if (refMatch) document.getElementById('referencia').value = refMatch[1];
        
        // Find Amount (Matches "1,00 Bs", "Bs 1,00", "Monto: 1,00")
        const amountMatch = cleanText.match(/(?:monto|importe|total)[\s$BS]*([\d.,]+)/i) || 
                            cleanText.match(/([\d.,]+)\s*(?:bs|Bs|BS)/) ||
                            cleanText.match(/[\$BbsS]\s*([\d.,]+)/) ||
                            cleanText.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/); 
        if (amountMatch) {
            let rawAmount = amountMatch[1];
            // Format Venezuelan style "1.250,00" or "1,00" to API standard "1250.00" or "1.00"
            // Remove points acting as thousands separator, then change comma to decimal point
            let cleanAmount = rawAmount.replace(/\./g, ''); 
            cleanAmount = cleanAmount.replace(/,/g, '.');
            document.getElementById('importe').value = cleanAmount;
        }

        // Find Date (looking for YYYY-MM-DD or DD/MM/YYYY)
        const dateMatch = cleanText.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
        if (dateMatch) {
            document.getElementById('fechaPago').value = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
        } else {
             const exactDateStr = cleanText.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
             if(exactDateStr) document.getElementById('fechaPago').value = exactDateStr[0];
        }
        
        // Find Cedula of Sender (Avoid "Identificación:" because that's the receiving business RIF in BDV)
        // We look strictly for Venezuelan Cedulas like V-12345678 or E12345678 to be safe.
        const cedulaMatch = cleanText.match(/(?:ci|c\.i)[\s.-]*([vejVEJ]?[\s.-]*\d{6,9})/i) || cleanText.match(/[VEJvej][\s.-]+(\d{6,9})/);
        if (cedulaMatch) {
            let cleanCed = cedulaMatch[1].replace(/[\s.-]/g, '');
            if (!/^[VEJ]/.test(cleanCed.toUpperCase())) {
                cleanCed = 'V' + cleanCed; // Default to V if missing
            }
            document.getElementById('cedulaPagador').value = cleanCed.toUpperCase();
        }
        
        // Find Phone numbers (e.g. 0414, 0424, 0412, 0422, 0416, 0426) 
        // Emphasizing exactly 11 digits
        let phoneMatches = [];
        const regexPhones = /(?:0414|0424|0412|0416|0426|0422|0212)[-.\s]?\d{3}[-.\s]?\d{4}/g;
        let match;
        while ((match = regexPhones.exec(cleanText)) !== null) {
            phoneMatches.push(match[0].replace(/[-.\s]/g, ''));
        }

        // In BDV receipts, "Destino" (receiving phone) usually comes last in the visual list of phones.
        if (phoneMatches.length >= 1) {
            document.getElementById('telefonoDestino').value = phoneMatches[0];
        }
        if (phoneMatches.length >= 2) {
             // If there's a second phone found, assume the first was Payer and second is Destino (based on typical reading order)
             document.getElementById('telefonoPagador').value = phoneMatches[0];
             document.getElementById('telefonoDestino').value = phoneMatches[1];
        }

        // Find Banco Origen - Comprehensive mapping of Venezuelan Banks
        const bankMap = {
            '0102': /venezuela|bdv/i,
            '0134': /banesco/i,
            '0105': /mercantil|merc/i,
            '0108': /provincial|bbva/i,
            '0114': /bancaribe|caribe/i,
            '0115': /exterior/i,
            '0128': /caron[ií]/i,
            '0138': /plaza/i,
            '0151': /bfc|fondo\s*com[uú]n/i,
            '0156': /100%|cien\s*por\s*ciento/i,
            '0171': /activo/i,
            '0172': /bancamiga|amiga/i,
            '0174': /banplus|plus/i,
            '0175': /bicentenario/i,
            '0177': /banfanb|fanb/i,
            '0191': /nacional\s*de\s*cr[eé]dito|bnc/i
        };

        for (const [code, regex] of Object.entries(bankMap)) {
            if (cleanText.match(regex)) {
                document.getElementById('bancoOrigen').value = code;
                break; 
            }
        }

        // Trigger input event manually so checkFormValidity picks it up
        formInputs.forEach(i => i.dispatchEvent(new Event('input')));
    }

    // Toggle Form visibility
    showFormBtn.addEventListener('click', () => {
        if (apiForm.classList.contains('hidden')) {
            apiForm.classList.remove('hidden');
            showFormBtn.innerHTML = '<i data-lucide="chevron-up"></i> Hide Details Form';
        } else {
            apiForm.classList.add('hidden');
            showFormBtn.innerHTML = '<i data-lucide="edit-3"></i> Input Details Manually';
        }
        lucide.createIcons();
    });

    // Validate form to enable Verify Button
    const formInputs = apiForm.querySelectorAll('input');
    formInputs.forEach(input => {
        input.addEventListener('input', checkFormValidity);
    });

    function checkFormValidity() {
        let isValid = true;
        formInputs.forEach(input => {
            if (!input.value.trim()) isValid = false;
        });
        
        verifyBtn.disabled = !isValid;
    }

    // Remove Image
    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent clicking the dropzone beneath
        currentFile = null;
        fileInput.value = ''; // reset input
        imagePreview.src = '';
        previewContent.classList.add('hidden');
        uploadContent.classList.remove('hidden');
        
        showFormBtn.disabled = true;
        verifyBtn.disabled = true;
        apiForm.classList.add('hidden');
        showFormBtn.innerHTML = '<i data-lucide="edit-3"></i> Input Details Manually';
        
        // Reset form inputs
        formInputs.forEach(input => input.value = '');
        
        // Reset results state
        hideAllStates();
        stateEmpty.classList.remove('hidden');
        lucide.createIcons();
    });

    // Helper to switch states
    function hideAllStates() {
        stateEmpty.classList.add('hidden');
        stateLoading.classList.add('hidden');
        stateSuccess.classList.add('hidden');
        stateError.classList.add('hidden');
    }

    // Generate random mock reference
    function generateRef() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = 'TRX-';
        for (let i = 0; i < 8; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Formatter date (for UI display just in case)
    function getToday() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    // Format Step Visuals
    const step2 = document.getElementById('step-2');
    const step3 = document.getElementById('step-3');

    function resetSteps() {
        step2.className = 'pending';
        step2.innerHTML = '<i data-lucide="circle"></i> Establishing secure connection (Backend Proxy)';
        step3.className = 'pending';
        step3.innerHTML = '<i data-lucide="circle"></i> Validating with BDV Conciliacion API';
        lucide.createIcons();
    }

    // Verify Process (REAL API HTTP CALL)
    verifyBtn.addEventListener('click', async () => {
        if (!currentFile || verifyBtn.disabled) return;

        // Gather Data from UI Form
        const payload = {
            cedulaPagador: document.getElementById('cedulaPagador').value.trim(),
            telefonoPagador: document.getElementById('telefonoPagador').value.trim(),
            telefonoDestino: document.getElementById('telefonoDestino').value.trim(),
            referencia: document.getElementById('referencia').value.trim(),
            fechaPago: document.getElementById('fechaPago').value.trim(), // YYYY-MM-DD
            importe: document.getElementById('importe').value.trim(),
            bancoOrigen: document.getElementById('bancoOrigen').value.trim()
        };

        // Disable UI
        verifyBtn.disabled = true;
        verifyBtn.innerHTML = '<i data-lucide="loader-2" class="lucide-spin"></i> Processing...';
        formInputs.forEach(i => i.disabled = true);
        lucide.createIcons();
        
        hideAllStates();
        stateLoading.classList.remove('hidden');
        
        // Simulation Timeline for UI feedback
        progressBar.style.width = '10%';
        resetSteps();
        
        setTimeout(() => {
            progressBar.style.width = '40%';
            step2.className = 'active';
            step2.innerHTML = '<i data-lucide="check-circle-2"></i> Connecting to Backend Server...';
            lucide.createIcons();
        }, 500);

        try {
            // Send request to our Node.js Proxy Server
            const response = await fetch('http://localhost:3000/api/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            const data = await response.json();

            progressBar.style.width = '80%';
            step2.className = '';
            step2.innerHTML = '<i data-lucide="check"></i> Proxy Connected';
            step3.className = 'active';
            step3.innerHTML = '<i data-lucide="search"></i> Verifying with BDV...';
            lucide.createIcons();

            // Wait a tiny bit just for the UI to catch up to real network speed
            await new Promise(r => setTimeout(r, 600)); 
            
            progressBar.style.width = '100%';
            hideAllStates();

            // Treat 1000 or specific "realizada anteriormente" messages as success
            const isDuplicate = data.message && data.message.toLowerCase().includes('anteriormente');

            if (data.code === '1000' || data.code === 1000 || isDuplicate) {
                document.getElementById('success-ref').textContent = payload.referencia;
                document.getElementById('success-date').textContent = payload.fechaPago;
                
                let displayAmount = payload.importe;
                if (data.data && data.data.amount) {
                    displayAmount = data.data.amount;
                }
                document.querySelector('.value.highlight').textContent = `${displayAmount} Bs.`;
                
                stateSuccess.classList.remove('hidden');
                
                const duplicateNote = document.getElementById('duplicate-note');
                if (isDuplicate && duplicateNote) {
                    duplicateNote.textContent = "Nota: " + data.message;
                    duplicateNote.classList.remove('hidden');
                } else if (duplicateNote) {
                    duplicateNote.classList.add('hidden');
                }
            } else {
                document.getElementById('error-ref').textContent = payload.referencia;
                document.getElementById('error-message').textContent = data.message || "Error during verification. Please check the details.";
                stateError.classList.remove('hidden');
            }
        } catch (error) {
            console.error("Error calling backend:", error);
            
            hideAllStates();
            document.getElementById('error-ref').textContent = payload.referencia;
            document.getElementById('error-message').textContent = "Failed to connect to the backend server. Is it running on port 3000?";
            stateError.classList.remove('hidden');
        } finally {
            // Restore UI
            verifyBtn.innerHTML = '<i data-lucide="shield-check"></i> Verify with BDV API';
            verifyBtn.disabled = false;
            formInputs.forEach(i => i.disabled = false);
            lucide.createIcons();
        }
    });

    // Reset Buttons
    document.getElementById('reset-btn-success').addEventListener('click', resetBoard);
    document.getElementById('reset-btn-error').addEventListener('click', resetBoard);

    function resetBoard() {
        removeBtn.click(); // Trigger the remove logic
    }
});
