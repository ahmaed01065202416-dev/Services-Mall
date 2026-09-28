/**
 * ============================================================================
 * SERVICES.JS — Services Manager v3.0
 * Load · Search · Filter · Add · Edit · Delete Services
 * ============================================================================
 */
(function () {
    'use strict';

    let _allServices   = [];
    let _filtered      = [];
    let _lastDoc       = null;
    let _loading       = false;
    const PAGE_SIZE    = 12;

    const ServicesManager = {

        // ── Load All Services ─────────────────────────────────────────────────
        async loadServices(reset = true) {
            if (_loading) return;
            _loading = true;

            if (reset) { _allServices = []; _filtered = []; _lastDoc = null; }

            try {
                let query = window.db.collection(COLLECTIONS.SERVICES)
                    .where('active', '==', true)
                    .orderBy('createdAt', 'desc')
                    .limit(PAGE_SIZE);

                if (_lastDoc && !reset) query = query.startAfter(_lastDoc);

                const snap = await query.get();
                _lastDoc   = snap.docs[snap.docs.length - 1] || null;

                const newServices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                _allServices = reset ? newServices : [..._allServices, ...newServices];
                _filtered    = [..._allServices];

                this._renderServiceCards(_filtered);

                // Load more button
                const loadMoreBtn = document.getElementById('loadMoreBtn');
                if (loadMoreBtn) loadMoreBtn.classList.toggle('hidden', snap.docs.length < PAGE_SIZE);

            } catch (err) {
                if (err.code === 'failed-precondition') {
                    console.warn('[Services] Missing index, loading without order:', err.message?.match(/https?:\/\/[^\s]+/)?.[0] || '');
                    await this._loadFallback();
                } else {
                    console.warn('[Services] Load error:', err.message);
                }
            } finally {
                _loading = false;
            }
        },

        async _loadFallback() {
            try {
                const snap = await window.db.collection(COLLECTIONS.SERVICES)
                    .where('active', '==', true).limit(PAGE_SIZE).get();
                _allServices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                _filtered    = [..._allServices];
                this._renderServiceCards(_filtered);
            } catch (err) {
                console.warn('[Services] Fallback error:', err.message);
            }
        },

        // ── Search ────────────────────────────────────────────────────────────
        search(query) {
            const q = (query || '').trim().toLowerCase();
            if (!q) {
                _filtered = [..._allServices];
            } else {
                _filtered = _allServices.filter(s =>
                    (s.title || '').toLowerCase().includes(q) ||
                    (s.description || '').toLowerCase().includes(q) ||
                    (s.sellerName || '').toLowerCase().includes(q) ||
                    (s.category || '').toLowerCase().includes(q) ||
                    (s.tags || []).some(t => t.toLowerCase().includes(q))
                );
            }
            this._renderServiceCards(_filtered);
        },

        // ── Filter by Category ────────────────────────────────────────────────
        filterCategory(cat) {
            // Update UI
            document.querySelectorAll('.cat-btn').forEach(btn => {
                const isActive = btn.dataset.cat === cat;
                btn.classList.toggle('bg-brand-600', isActive);
                btn.classList.toggle('text-white', isActive);
                btn.classList.toggle('bg-white', !isActive);
                btn.classList.toggle('text-gray-600', !isActive);
                btn.classList.toggle('border-gray-200', !isActive);
            });

            _filtered = !cat ? [..._allServices] : _allServices.filter(s => s.category === cat);
            this._renderServiceCards(_filtered);
        },

        // ── Sort ──────────────────────────────────────────────────────────────
        sort(by) {
            switch (by) {
                case 'price_asc':  _filtered.sort((a,b) => (a.price||0)  - (b.price||0));   break;
                case 'price_desc': _filtered.sort((a,b) => (b.price||0)  - (a.price||0));   break;
                case 'rating':     _filtered.sort((a,b) => (b.rating||0) - (a.rating||0));  break;
                default:           _filtered.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
            }
            this._renderServiceCards(_filtered);
        },

        // ── Render Cards ──────────────────────────────────────────────────────
        _renderServiceCards(services) {
            const grid  = document.getElementById('servicesGrid');
            const empty = document.getElementById('servicesEmpty');
            if (!grid) return;

            if (!services || services.length === 0) {
                grid.innerHTML = '';
                if (empty) empty.classList.remove('hidden');
                return;
            }
            if (empty) empty.classList.add('hidden');

            const isAr = AppState.language !== 'en';
            grid.innerHTML = services.map(s => this._serviceCard(s, isAr)).join('');
        },

        _serviceCard(s, isAr) {
            const stars = Math.round(s.rating || 0);
            const price = formatCurrency(s.price || 0);
            return `
            <div class="service-card card group cursor-pointer" onclick="ServicesManager.openServiceDetail('${s.id}')">
              <!-- Thumbnail -->
              <div class="relative overflow-hidden">
                <img src="${s.image || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400'}"
                  class="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                  onerror="this.src='https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400'">
                ${s.featured ? '<span class="absolute top-3 start-3 bg-gradient-to-r from-brand-500 to-brand-700 text-white text-xs font-bold px-3 py-1 rounded-full shadow">⭐ مميز</span>' : ''}
                <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all duration-300 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100">
                  <button onclick="event.stopPropagation();ServicesManager.openServiceDetail('${s.id}')"
                    class="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition">
                    <i class="fa-solid fa-eye text-brand-600"></i>
                  </button>
                  <button onclick="event.stopPropagation();RequestSystem.openRequestModal(${JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:s.image||'',sellerId:s.sellerId||'',sellerName:s.sellerName||'',deliveryDays:s.deliveryDays||3}).replace(/"/g,'&quot;')})"
                    class="w-10 h-10 bg-brand-600 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition">
                    <i class="fa-solid fa-paper-plane text-white"></i>
                  </button>
                </div>
              </div>

              <!-- Body -->
              <div class="p-4">
                <!-- Seller -->
                <div class="flex items-center gap-2 mb-3">
                  <img src="${s.sellerAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.sellerName||'U')}&background=0284c7&color=fff`}"
                    class="w-7 h-7 rounded-full object-cover flex-shrink-0" loading="lazy"
                    onerror="this.src='https://ui-avatars.com/api/?name=U&background=0284c7&color=fff'">
                  <span class="text-xs text-gray-600 font-semibold truncate">${s.sellerName || '—'}</span>
                  ${s.sellerVerified ? '<i class="fa-solid fa-circle-check text-brand-500 text-xs flex-shrink-0"></i>' : ''}
                </div>

                <!-- Title -->
                <h3 class="font-black text-gray-900 text-sm leading-snug mb-3 line-clamp-2" style="min-height:2.5rem">${s.title || '—'}</h3>

                <!-- Rating -->
                <div class="flex items-center gap-1 mb-3">
                  ${Array.from({length:5},(_,i) => `<i class="fa-solid fa-star text-xs ${i < stars ? 'text-yellow-400' : 'text-gray-200'}"></i>`).join('')}
                  <span class="text-xs text-gray-400 font-medium">(${s.reviewCount || 0})</span>
                </div>

                <!-- Price & delivery -->
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-xs text-gray-400">${isAr ? 'يبدأ من' : 'Starting at'}</p>
                    <p class="font-black text-brand-700 text-base" data-price-egp="${s.price||0}">${price}</p>
                  </div>
                  <div class="text-end">
                    <p class="text-xs text-gray-400">${t('services.delivery')}</p>
                    <p class="text-xs font-bold text-gray-600">${s.deliveryDays || 3} ${t('services.days')}</p>
                  </div>
                </div>

                <!-- Action Buttons -->
                <div class="flex gap-2 mt-4">
                  ${ (function() {
                    var uid = AppState.currentUser && AppState.currentUser.uid;
                    var isOwnService = uid && uid === s.sellerId;
                    var isAdm = AppState.currentUser && AppState.currentUser.role === 'admin';
                    var editDataStr = JSON.stringify({id:s.id,title:s.title||'',description:s.description||'',category:s.category||'',price:s.price||0,deliveryDays:s.deliveryDays||3,revisions:s.revisions||2,image:s.image||''}).replace(/"/g,'&quot;');
                    var serviceDataStr = JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:s.image||'',sellerId:s.sellerId||'',sellerName:s.sellerName||'',deliveryDays:s.deliveryDays||3}).replace(/"/g,'&quot;');
                    var cartDataStr = JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:s.image||'',sellerId:s.sellerId||'',sellerName:s.sellerName||''}).replace(/"/g,'&quot;');
                    var lang = AppState.language;
                    if (isOwnService || isAdm) {
                      return '<button onclick="event.stopPropagation();ServicesManager.deleteService(\'' + s.id + '\')" class="flex-1 bg-red-50 border-2 border-red-200 text-red-600 rounded-xl py-2.5 text-sm font-bold hover:bg-red-600 hover:text-white transition flex items-center justify-center gap-1"><i class=\"fa-solid fa-trash text-xs\"></i>' + (lang !== 'en' ? 'حذف الخدمة' : 'Delete') + '</button>'
                           + '<button onclick="event.stopPropagation();ServicesManager._renderAddServiceForm(' + editDataStr + ');navigateTo(\'add-service\')" class="w-10 h-10 flex-shrink-0 border-2 border-gray-200 text-gray-600 rounded-xl flex items-center justify-center hover:bg-gray-100 transition"><i class=\"fa-solid fa-pen text-xs\"></i></button>';
                    }
                    return '<button onclick="event.stopPropagation();RequestSystem.openRequestModal(' + serviceDataStr + ')" class="flex-1 btn-primary py-2.5 text-sm"><i class=\"fa-solid fa-paper-plane me-1\"></i>' + (lang !== 'en' ? 'طلب الخدمة' : 'Request Service') + '</button>';
                  })()}
                </div>
              </div>
            </div>`;
        },

        // ── Service Detail ────────────────────────────────────────────────────
        async openServiceDetail(serviceId) {
            showLoading();
            try {
                const snap = await window.db.collection(COLLECTIONS.SERVICES).doc(serviceId).get();
                if (!snap.exists) { hideLoading(); showToast('Service not found', 'error'); return; }
                const s = { id: snap.id, ...snap.data() };
                AppState.currentService = s;

                const isAr  = AppState.language !== 'en';
                const stars = Math.round(s.rating || 0);
                const modal = document.getElementById('serviceModalContent');

                if (modal) {
                    modal.innerHTML = `
                    <div>
                      <!-- Cover image -->
                      <div class="relative">
                        <img src="${s.image || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800'}"
                          class="w-full h-72 object-cover"
                          onerror="this.src='https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800'">
                        <button onclick="closeModal('serviceModal')"
                          class="absolute top-4 end-4 w-10 h-10 bg-black/50 backdrop-blur-sm text-white rounded-xl flex items-center justify-center hover:bg-black/70 transition">
                          <i class="fa-solid fa-xmark text-lg"></i>
                        </button>
                      </div>

                      <div class="p-6 space-y-5">
                        <!-- Title & Category -->
                        <div>
                          <span class="text-xs bg-brand-50 text-brand-600 font-bold px-3 py-1 rounded-full">${s.category || ''}</span>
                          <h2 class="text-2xl font-black text-gray-900 mt-2">${s.title || '—'}</h2>
                          <div class="flex items-center gap-2 mt-2">
                            ${Array.from({length:5},(_,i)=>`<i class="fa-solid fa-star text-sm ${i<stars?'text-yellow-400':'text-gray-200'}"></i>`).join('')}
                            <span class="text-sm text-gray-500">(${s.reviewCount || 0} ${t('services.reviews')})</span>
                          </div>
                        </div>

                        <!-- Seller -->
                        <div class="flex items-center gap-3 bg-gray-50 rounded-2xl p-4">
                          <img src="${s.sellerAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.sellerName||'U')}&background=0284c7&color=fff`}"
                            class="w-12 h-12 rounded-xl object-cover">
                          <div>
                            <p class="font-black text-gray-900">${s.sellerName || '—'}</p>
                            <p class="text-sm text-gray-500">${s.sellerTitle || ''}</p>
                          </div>
                          ${s.sellerVerified ? '<span class="ms-auto bg-brand-100 text-brand-700 text-xs font-bold px-3 py-1 rounded-full"><i class="fa-solid fa-check me-1"></i>موثّق</span>' : ''}
                        </div>

                        <!-- Description -->
                        <div>
                          <h3 class="font-black text-gray-900 mb-2">${isAr ? 'وصف الخدمة' : 'Service Description'}</h3>
                          <p class="text-gray-600 leading-relaxed text-sm">${s.description || '—'}</p>
                        </div>

                        <!-- Meta -->
                        <div class="grid grid-cols-3 gap-3">
                          <div class="bg-brand-50 rounded-xl p-3 text-center">
                            <i class="fa-solid fa-clock text-brand-600 text-xl mb-1"></i>
                            <p class="text-xs text-gray-500">${t('services.delivery')}</p>
                            <p class="font-black text-gray-900 text-sm">${s.deliveryDays || 3} ${t('services.days')}</p>
                          </div>
                          <div class="bg-green-50 rounded-xl p-3 text-center">
                            <i class="fa-solid fa-rotate-left text-green-600 text-xl mb-1"></i>
                            <p class="text-xs text-gray-500">${isAr ? 'مراجعات' : 'Revisions'}</p>
                            <p class="font-black text-gray-900 text-sm">${s.revisions || 2}</p>
                          </div>
                          <div class="bg-amber-50 rounded-xl p-3 text-center">
                            <i class="fa-solid fa-star text-amber-500 text-xl mb-1"></i>
                            <p class="text-xs text-gray-500">${isAr ? 'التقييم' : 'Rating'}</p>
                            <p class="font-black text-gray-900 text-sm">${(s.rating || 5).toFixed(1)}</p>
                          </div>
                        </div>

                        <!-- Price & Actions -->
                        <div class="bg-gradient-to-r from-brand-600 to-brand-800 rounded-2xl p-5 text-white">
                          <div class="flex items-center justify-between mb-4">
                            <div>
                              <p class="text-brand-200 text-sm">${isAr ? 'السعر الإجمالي' : 'Total Price'}</p>
                              <p class="text-3xl font-black" data-price-egp="${s.price||0}">${formatCurrency(s.price || 0)}</p>
                            </div>
                            <div class="bg-white/15 rounded-xl px-3 py-2 text-sm font-bold">
                              ${isAr ? 'مدفوع بأمان عبر Escrow' : 'Secured by Escrow'}
                            </div>
                          </div>
                          <div class="flex gap-3">
                            <button onclick="closeModal('serviceModal');RequestSystem.openRequestModal(${JSON.stringify({id:s.id,title:s.title||'',price:s.price||0,image:s.image||'',sellerId:s.sellerId||'',sellerName:s.sellerName||'',deliveryDays:s.deliveryDays||3}).replace(/"/g,'&quot;')})"
                              class="flex-1 bg-white text-brand-700 font-black py-3.5 rounded-xl hover:bg-brand-50 transition flex items-center justify-center gap-2">
                              <i class="fa-solid fa-paper-plane"></i>${AppState.language !== 'en' ? 'طلب الخدمة' : 'Request Service'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>`;
                    openModal('serviceModal');
                }
                hideLoading();

                // Load reviews
                this._loadServiceReviews(serviceId);
            } catch (err) {
                hideLoading();
                showToast(t('general.error'), 'error');
            }
        },

        async _loadServiceReviews(serviceId) {
            try {
                const snap = await window.db.collection(COLLECTIONS.REVIEWS)
                    .where('serviceId', '==', serviceId)
                    .orderBy('createdAt', 'desc').limit(5).get();

                const modal = document.getElementById('serviceModalContent');
                if (!snap.empty && modal) {
                    const isAr = AppState.language !== 'en';
                    const reviewsHtml = `
                    <div class="px-6 pb-6">
                      <h3 class="font-black text-gray-900 mb-4">${isAr ? 'التقييمات' : 'Reviews'}</h3>
                      <div class="space-y-4">
                        ${snap.docs.map(d => {
                            const r = d.data();
                            const stars = Math.round(r.rating || 5);
                            return `
                            <div class="bg-gray-50 rounded-xl p-4">
                              <div class="flex items-center gap-3 mb-2">
                                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(r.reviewerName||'U')}&background=0284c7&color=fff"
                                  class="w-8 h-8 rounded-full">
                                <div>
                                  <p class="font-bold text-gray-900 text-sm">${r.reviewerName || '—'}</p>
                                  <div class="flex gap-0.5">${Array.from({length:5},(_,i)=>`<i class="fa-solid fa-star text-xs ${i<stars?'text-yellow-400':'text-gray-300'}"></i>`).join('')}</div>
                                </div>
                                <span class="ms-auto text-xs text-gray-400">${formatTimeAgo(r.createdAt)}</span>
                              </div>
                              <p class="text-sm text-gray-600">${r.text || ''}</p>
                            </div>`;
                        }).join('')}
                      </div>
                    </div>`;
                    modal.innerHTML += reviewsHtml;
                }
            } catch (_) {}
        },

        // ── Add Service Form ──────────────────────────────────────────────────
        openAddServiceForm() {
            const user = AppState.currentUser;
            if (!user) { showToast(t('general.login_req'), 'warning'); navigateTo('login'); return; }
            if (user.role !== 'seller' && user.role !== 'admin') {
                showToast(AppState.language === 'en' ? 'Only sellers can add services' : 'يجب أن تكون بائعاً لإضافة خدمات', 'warning');
                return;
            }
            navigateTo('add-service');
            this._renderAddServiceForm();
        },

        _renderAddServiceForm(service = null) {
            const container = document.getElementById('addServiceContent');
            if (!container) return;
            const isAr  = AppState.language !== 'en';
            const isEdit = !!service;

            const categories = [
                { value: 'design',      label: isAr ? '🎨 تصميم'  : '🎨 Design'    },
                { value: 'programming', label: isAr ? '💻 برمجة'   : '💻 Programming'},
                { value: 'marketing',   label: isAr ? '📈 تسويق'   : '📈 Marketing'  },
                { value: 'writing',     label: isAr ? '✍️ كتابة'   : '✍️ Writing'    },
                { value: 'video',       label: isAr ? '🎬 فيديو'   : '🎬 Video'      },
                { value: 'seo',         label: isAr ? '🔍 SEO'     : '🔍 SEO'        },
                { value: 'audio',       label: isAr ? '🎧 صوتيات'  : '🎧 Audio'      },
                { value: 'data',        label: isAr ? '📊 بيانات'  : '📊 Data'       },
                { value: 'other',       label: isAr ? 'أخرى'       : 'Other'          },
            ];

            container.innerHTML = `
            <div class="max-w-2xl mx-auto">
              <div class="flex items-center gap-4 mb-8">
                <button onclick="navigateTo('dashboard')" class="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center hover:bg-gray-200 transition">
                  <i class="fa-solid fa-arrow-${isAr?'right':'left'}"></i>
                </button>
                <h1 class="text-2xl font-black text-gray-900">${isEdit ? (isAr?'تعديل الخدمة':'Edit Service') : (isAr?'إضافة خدمة جديدة':'Add New Service')}</h1>
              </div>

              <form onsubmit="event.preventDefault();ServicesManager.saveService('${service?.id||''}')" class="space-y-6">
                <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-5">

                  <div>
                    <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'عنوان الخدمة':'Service Title'} *</label>
                    <input type="text" id="svcTitle" class="form-input" maxlength="120"
                      value="${service?.title||''}"
                      placeholder="${isAr?'مثال: تصميم شعار احترافي بأسلوب حديث':'e.g. Professional logo design in modern style'}">
                  </div>

                  <div>
                    <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'وصف الخدمة':'Description'} *</label>
                    <textarea id="svcDesc" rows="5" class="form-input" maxlength="2000"
                      placeholder="${isAr?'اشرح تفاصيل خدمتك، ما الذي تقدمه، ومزاياك...':'Describe your service in detail...'}">${service?.description||''}</textarea>
                  </div>

                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'التصنيف':'Category'} *</label>
                      <select id="svcCategory" class="form-input">
                        ${categories.map(c => `<option value="${c.value}" ${service?.category===c.value?'selected':''}>${c.label}</option>`).join('')}
                      </select>
                    </div>
                    <div>
                      <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'السعر (ج.م)':'Price (EGP)'} *</label>
                      <input type="number" id="svcPrice" class="form-input" min="5" max="100000" step="0.5"
                        value="${service?.price||''}" placeholder="150">
                    </div>
                  </div>

                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'مدة التسليم (أيام)':'Delivery (days)'}</label>
                      <input type="number" id="svcDelivery" class="form-input" min="1" max="60"
                        value="${service?.deliveryDays||3}" placeholder="3">
                    </div>
                    <div>
                      <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'عدد المراجعات':'Revisions'}</label>
                      <input type="number" id="svcRevisions" class="form-input" min="0" max="20"
                        value="${service?.revisions||2}" placeholder="2">
                    </div>
                  </div>

                  <div>
                    <label class="block text-sm font-bold text-gray-700 mb-2">${isAr?'صورة الخدمة':'Service Image'}</label>
                    <div class="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center hover:border-brand-400 transition cursor-pointer" onclick="document.getElementById('svcImageFile').click()">
                      <i id="uploadZoneText" class="fa-solid fa-cloud-arrow-up text-3xl text-gray-300 mb-2"></i>
                      <p class="text-sm text-gray-400">${isAr?'انقر لاختيار صورة أو اسحب وأفلت':'Click to upload or drag & drop'}</p>
                      <input type="file" id="svcImageFile" accept="image/*" class="hidden"
                        onchange="previewImage(this,'serviceImagePreview')">
                    </div>
                    <!-- hidden: stores existing image URL so saveService() can keep it when no new file chosen -->
                    <input type="hidden" id="svcExistingImage" value="${service?.image || ''}">
                    ${service?.image ? `<img src="${service.image}" class="image-upload-preview show mt-3" id="serviceImagePreview">` : '<img id="serviceImagePreview" class="image-upload-preview">'}
                  </div>

                </div>

                <button type="submit" class="btn-primary w-full py-5 text-lg">
                  <i class="fa-solid fa-plus me-2"></i>${isEdit ? (isAr?'حفظ التعديلات':'Save Changes') : (isAr?'نشر الخدمة':'Publish Service')}
                </button>
              </form>
            </div>`;
        },

        async saveService(editId = '') {
            const user = AppState.currentUser;
            if (!user) return;

            const title       = sanitizeInput(document.getElementById('svcTitle')?.value?.trim() || '');
            const description = sanitizeInput(document.getElementById('svcDesc')?.value?.trim() || '', 2000);
            const category    = document.getElementById('svcCategory')?.value || 'other';
            const price       = parseFloat(document.getElementById('svcPrice')?.value) || 0;
            const deliveryDays= parseInt(document.getElementById('svcDelivery')?.value) || 3;
            const revisions   = parseInt(document.getElementById('svcRevisions')?.value) || 2;
            const imageFile   = document.getElementById('svcImageFile')?.files[0];

            if (!title)     { showToast(AppState.language==='en'?'Enter a title':'أدخل عنوان الخدمة', 'warning'); return; }
            if (!description){ showToast(AppState.language==='en'?'Enter a description':'أدخل وصف الخدمة', 'warning'); return; }
            if (price < 5)  { showToast(AppState.language==='en'?'Min price is 5 EGP':'الحد الأدنى للسعر 5 ج.م', 'warning'); return; }

            showLoading(AppState.language==='en'?'Publishing service...':'جاري نشر الخدمة...');
            try {
                let imageUrl = editId
                    ? (document.getElementById('svcExistingImage')?.value || AppState.currentService?.image || '')
                    : '';
                if (imageFile) {
                    imageUrl = await uploadFile(imageFile, 'services', `svc_${user.uid}_${Date.now()}`);
                }

                const data = {
                    title, description, category,
                    price, deliveryDays, revisions,
                    image:         imageUrl,
                    sellerId:      user.uid,
                    sellerName:    user.displayName || '',
                    sellerAvatar:  user.photoURL || '',
                    sellerVerified: user.verified || false,
                    active:        true,
                    status:        'active',        // ← required by SellerDash
                    featured:      false,
                    rating:        0,
                    reviewCount:   0,
                    orderCount:    0,
                    ordersCount:   0,               // ← SellerDash reads this field
                    views:         0,               // ← SellerDash reads this field
                    updatedAt:     serverTimestamp(),
                };

                if (editId) {
                    await window.db.collection(COLLECTIONS.SERVICES).doc(editId).update(data);
                } else {
                    data.createdAt = serverTimestamp();
                    await window.db.collection(COLLECTIONS.SERVICES).add(data);
                }

                hideLoading();
                showToast(AppState.language==='en'?'Service published!':'تم نشر الخدمة!', 'success');
                navigateTo('dashboard');
            } catch (err) {
                hideLoading();
                showToast(t('general.error') + ': ' + err.message, 'error');
            }
        },

        // ── Delete Service ────────────────────────────────────────────────────
        async deleteService(serviceId) {
            const isAr  = AppState.language !== 'en';
            const user  = AppState.currentUser;

            if (!user) {
                showToast(isAr ? 'يجب تسجيل الدخول أولاً' : 'Please log in first', 'error');
                return;
            }

            if (!confirm(isAr
                ? 'هل أنت متأكد من حذف هذه الخدمة نهائياً؟ لا يمكن التراجع.'
                : 'Permanently delete this service? This cannot be undone.')) return;

            showLoading(isAr ? 'جاري الحذف...' : 'Deleting...');
            try {
                const ref  = window.db.collection(COLLECTIONS.SERVICES).doc(serviceId);
                const snap = await ref.get();

                // Verify the service exists
                if (!snap.exists) {
                    hideLoading();
                    showToast(isAr ? 'الخدمة غير موجودة' : 'Service not found', 'error');
                    return;
                }

                // Verify ownership (extra safety before Firestore rule fires)
                const data = snap.data();
                if (data.sellerId !== user.uid && AppState.currentUser && AppState.currentUser.role !== 'admin') {
                    hideLoading();
                    showToast(isAr ? 'غير مصرح لك بحذف هذه الخدمة' : 'Not authorized to delete this service', 'error');
                    return;
                }

                await ref.delete();
                hideLoading();
                showToast(isAr ? '✅ تم حذف الخدمة بنجاح' : '✅ Service deleted successfully', 'success');

                // Remove card from DOM immediately without waiting for re-fetch
                const card = document.querySelector(`[data-service-id="${serviceId}"]`);
                if (card) {
                    card.style.transition = 'opacity .25s';
                    card.style.opacity    = '0';
                    setTimeout(() => card.remove(), 250);
                }

                // Refresh the correct panel — FIX: use window.DashboardManager (different IIFE scope)
                const isAdminCtx = !!document.getElementById('adminTabContent');
                if (isAdminCtx && typeof window.adminTab === 'function') {
                    window.adminTab('services');
                } else if (window.SellerDash) {
                    setTimeout(() => window.SellerDash.tab('my-services'), 300);
                } else if (typeof window.DashboardManager?.loadSellerServices === 'function') {
                    setTimeout(() => window.DashboardManager.loadSellerServices(), 300);
                }
            } catch (err) {
                hideLoading();
                console.error('[Delete Service]', err.code, err.message);
                const msg = err.code === 'permission-denied'
                    ? (isAr ? 'خطأ في الصلاحيات — تأكد من نشر قواعد Firestore' : 'Permission denied — make sure Firestore rules are published')
                    : err.message;
                showToast((isAr ? 'خطأ في الحذف: ' : 'Delete error: ') + msg, 'error');
            }
        },

        // ── Init services page ────────────────────────────────────────────────
        initServicesPage() {
            this.loadServices();
            if (AppState.filterCategory) {
                setTimeout(() => {
                    this.filterCategory(AppState.filterCategory);
                    AppState.filterCategory = '';
                }, 200);
            }
        },

        // ── Init add-service page ─────────────────────────────────────────────
        initAddServicePage() {
            const user = AppState.currentUser;
            const isAr = AppState.language !== 'en';
            if (!user) { navigateTo('login'); return; }
            if (!['seller','admin'].includes(user.role)) {
                const c = document.getElementById('addServiceContent');
                if (c) c.innerHTML = `
                <div class="text-center py-16">
                  <i class="fa-solid fa-lock text-gray-300 text-5xl mb-4"></i>
                  <h3 class="text-xl font-black text-gray-500 mb-3">${isAr?'يجب أن تكون بائعاً':'Seller Account Required'}</h3>
                  <button onclick="AuthManager.upgradeToSeller()" class="btn-primary px-8">
                    <i class="fa-solid fa-rocket me-2"></i>${isAr?'الترقية لبائع':'Upgrade to Seller'}
                  </button>
                </div>`;
                return;
            }
            this._renderAddServiceForm();
        }
    };

    // ── Load more ─────────────────────────────────────────────────────────────
    function loadMoreServices() {
        ServicesManager.loadServices(false);
    }

    // ── Expose ────────────────────────────────────────────────────────────────
    window.ServicesManager  = ServicesManager;
    window.loadMoreServices = loadMoreServices;

    // Add load-more button to services page
    document.addEventListener('DOMContentLoaded', () => {
        const grid = document.getElementById('servicesGrid');
        if (grid) {
            const btn = document.createElement('div');
            btn.className = 'col-span-full text-center mt-8';
            btn.innerHTML = `<button id="loadMoreBtn" onclick="loadMoreServices()" class="btn-secondary px-10 py-3 hidden">
              ${AppState.language==='en'?'Load More':'تحميل المزيد'}
            </button>`;
            grid.parentNode?.appendChild(btn);
        }
    });

    // Override initServicesPage
    window.initServicesPage    = () => ServicesManager.initServicesPage();
    window.initAddServicePage  = () => ServicesManager.initAddServicePage();

    console.log('✅ ServicesManager v3.0 loaded');
})();
