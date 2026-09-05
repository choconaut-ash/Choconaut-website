// ==========================================
// 1. CONFIGURATION
// ==========================================
// REPLACE THIS URL with your NEW Web App URL from Google Apps Script
 
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyZOYVS1gQyFUw4POm3tw0acl3fXiQPBmxtn2CMA4RZdLUK7toTCV2FYZH08-Tj3mml/exec";
const RAZORPAY_KEY = "rzp_live_Ryvp1z5m2CNlEo"; 

// ==========================================
// 2. DATA & STATE
// ==========================================
const products = { 
    milkyway: 270, 
    darkmatter: 270, 
    asteroid: 340, 
    nebula: 300, 
    velvet: 270, 
    smooth: 270, 
    celestial: 1699 
};

const names = { 
    milkyway: "Milkyway", 
    darkmatter: "Dark Matter", 
    asteroid: "Asteroid", 
    nebula: "Nebula", 
    velvet: "Velvet", 
    smooth: "Smooth", 
    celestial: "Celestial Luxury Combo" 
};

// BUNDLE LOGIC: Products eligible for the tiered discounts
const bundleEligible = ['milkyway', 'darkmatter', 'velvet', 'smooth'];

let cart = { 
    milkyway: 0, 
    darkmatter: 0, 
    asteroid: 0, 
    nebula: 0, 
    velvet: 0, 
    smooth: 0, 
    celestial: 0 
};

let inventory = {}; 
let currentSessionOrderId = "ORD-" + Date.now();

let subtotal = 0, discount = 0, deliveryCharge = 99, finalTotal = 0, paymentId = "", activeCoupon = 0;
// WELCOME10 REMOVED HERE:
const coupons = { "SPACE20": 20, "CHOCO10": 10 };

// GA4 Tracker Flag for Tiered Bundles
let currentBundleTier = 0;

// ==========================================
// 3. SOUND ENGINE
// ==========================================
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

function sfx(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    
    if (type === 'click') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(800, now); osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'tick') {
        osc.type = 'square'; osc.frequency.setValueAtTime(150, now);
        gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'success') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(400, now); osc.frequency.setValueAtTime(600, now + 0.1);
        gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    } else if (type === 'error') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(100, now);
        gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
    }
    osc.connect(gain); gain.connect(audioCtx.destination);
}

// ==========================================
// 4. INVENTORY LOGIC
// ==========================================
async function initInventory() {
    if(!SCRIPT_URL || SCRIPT_URL.includes("PASTE_YOUR")) {
        console.warn("Script URL missing. Stock validation disabled.");
        return;
    }
    try {
        const response = await fetch(SCRIPT_URL);
        const rawInventory = await response.json();
        
        inventory = {};
        for (let key in rawInventory) {
            inventory[key.toLowerCase().trim()] = rawInventory[key];
        }

        console.log("Cargo Manifest Synced:", inventory);
        updateStockUI();
    } catch (error) {
        console.error("Connection to Mission Control failed:", error);
    }
}

function updateStockUI() {
    for (let pid in products) {
        const cardEl = document.getElementById('card-' + pid);
        const plusBtn = document.getElementById('btn-plus-' + pid);
        const minusBtn = document.getElementById('btn-minus-' + pid);
        
        if (!cardEl) continue;

        if (inventory[pid] !== undefined && inventory[pid] <= 0) {
            cardEl.classList.add('out-of-stock');
            if(plusBtn) plusBtn.disabled = true;
            if(minusBtn) minusBtn.disabled = true;
            if(cart[pid] > 0) {
                cart[pid] = 0;
                const qtyDisplay = document.getElementById('qty-' + pid);
                if(qtyDisplay) qtyDisplay.innerText = 0;
                calculateTotals();
            }
        } else {
            cardEl.classList.remove('out-of-stock');
            if(plusBtn) plusBtn.disabled = false;
            if(minusBtn) minusBtn.disabled = false;
        }
    }
}

async function logOrderToSheet(statusType, overrideAddress = null) {
    const name = document.getElementById('name').value;
    const phone = document.getElementById('phone').value;
    const rawAddress = document.getElementById('address').value;
    const email = document.getElementById('email').value;
    
    const finalAddress = overrideAddress ? overrideAddress : rawAddress;

    if (!name || !phone) return; 

    let itemSummary = "";
    for (let k in cart) {
        if (cart[k] > 0) itemSummary += `${names[k]} (${cart[k]}), `;
    }

    const payload = {
        type: "logOrder",
        data: {
            orderId: currentSessionOrderId,
            name: name,
            email: email,
            phone: phone,
            address: finalAddress,
            itemSummary: itemSummary.replace(/,$/, ""), 
            total: finalTotal,
            items: cart 
        }
    };

    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.error("Log failed", e);
    }
}

// ==========================================
// 5. CART & QUANTITY LOGIC
// ==========================================
function updateQty(id, val) {
    if (val > 0 && inventory[id] !== undefined) {
        if (cart[id] >= inventory[id]) {
            sfx('error');
            alert(`ACCESS DENIED: Only ${inventory[id]} units of ${names[id]} remaining in stock.`);
            return;
        }
    }
    
    cart[id] += val; if(cart[id] < 0) cart[id] = 0;
    
    // --- META PIXEL ADD TO CART EVENT ---
    if (val > 0 && typeof fbq !== 'undefined') {
        fbq('track', 'AddToCart', {
            content_name: names[id],
            content_ids: [id],
            content_type: 'product',
            value: products[id],
            currency: 'INR'
        });
    }

    const display = document.getElementById('qty-' + id);
    if(display) display.innerText = cart[id];
    
    sfx('tick'); calculateTotals();
}

function calculateTotals() {
    subtotal = 0; 
    let count = 0;
    
    // Standard Calculation
    for(let k in cart) { 
        subtotal += cart[k] * products[k]; 
        count += cart[k]; 
    }

    // BUNDLE LOGIC (Min 4 of Eligible Items for 20%, Min 2 for 10%)
    let bundleCount = 0;
    let bundleSubtotal = 0;
    
    bundleEligible.forEach(id => {
        if (cart[id] > 0) {
            bundleCount += cart[id];
            bundleSubtotal += cart[id] * products[id];
        }
    });

    // --- GA4 DATALAYER TRACKING START ---
    if (bundleCount >= 4 && currentBundleTier !== 20) {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
            'event': 'bundle_unlocked',
            'offer_type': '20_percent_off',
            'item_count': bundleCount
        });
        currentBundleTier = 20;
        console.log("🚀 Choco-Naut Tracking: 20% Bundle Unlocked Event Sent!");
    } else if (bundleCount >= 2 && bundleCount < 4 && currentBundleTier !== 10) {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
            'event': 'bundle_unlocked',
            'offer_type': '10_percent_off',
            'item_count': bundleCount
        });
        currentBundleTier = 10;
        console.log("🚀 Choco-Naut Tracking: 10% Bundle Unlocked Event Sent!");
    } else if (bundleCount < 2) {
        currentBundleTier = 0;
    }
    // --- GA4 DATALAYER TRACKING END ---

    // Tiered Discount Trigger
    let bundleDiscount = 0;
    if (bundleCount >= 4) {
        bundleDiscount = Math.round(bundleSubtotal * 0.20);
    } else if (bundleCount >= 2) {
        bundleDiscount = Math.round(bundleSubtotal * 0.10);
    }

    // Shipping & Coupons
    let valueAfterBundle = subtotal - bundleDiscount;
    
    // DELIVERY LOGIC: Delivery applicable ONLY on single item (count === 1)
    if (count === 0) {
        deliveryCharge = 0;
    } else if (count === 1) {
        deliveryCharge = 99;
    } else {
        deliveryCharge = 0; // 2 or more items get FREE delivery
    }

    if(valueAfterBundle <= 800) activeCoupon = 0;
    let couponDiscount = Math.round(valueAfterBundle * (activeCoupon / 100));

    // UPDATE GLOBAL DISCOUNT
    discount = bundleDiscount + couponDiscount; 
    finalTotal = subtotal - discount + deliveryCharge;

    // UPDATE UI
    const elTotal = document.getElementById('totalPrice');
    const elSub = document.getElementById('subTotalVal');
    const elDel = document.getElementById('deliveryVal');
    const elModalTot = document.getElementById('modalTotal');
    const elDiscDisp = document.getElementById('discountDisplay');
    const elDiscVal = document.getElementById('discountVal');

    if(elTotal) elTotal.innerText = '₹' + finalTotal;
    if(elSub) elSub.innerText = '₹' + subtotal;
    if(elDel) elDel.innerText = deliveryCharge === 0 ? 'FREE' : '₹' + deliveryCharge;
    if(elModalTot) elModalTot.innerText = '₹' + finalTotal;
    
    // Show Savings
    if(elDiscDisp && elDiscVal) {
        if (discount > 0) {
            elDiscDisp.style.display = 'flex';
            let txt = '-₹' + discount;
            if(bundleDiscount > 0 && couponDiscount > 0) txt += " (Bundle + Coupon)";
            else if (bundleCount >= 4) txt += " (Bundle 20%)";
            else if (bundleCount >= 2) txt += " (Bundle 10%)";
            elDiscVal.innerText = txt;
        } else {
            elDiscDisp.style.display = 'none';
        }
    }

    // UPDATE CART BAR TEXT
    const bar = document.getElementById('cartBar');
    if (bar) {
        const barText = bar.querySelector('span'); 

        if(count > 0) {
            bar.classList.add('active');
            
            if (count === 1) {
                barText.innerHTML = `⚠️ <strong>ADD 1 MORE</strong> ITEM FOR 10% OFF + FREE DELIVERY!`;
                barText.style.color = "#ff6f00"; 
            } else if (bundleCount >= 2 && bundleCount < 4) {
                let needed = 4 - bundleCount;
                barText.innerHTML = `✅ <strong>10% OFF + FREE DELIVERY!</strong> ADD ${needed} MORE FOR 20% OFF!`;
                barText.style.color = "#25d366";
            } else if (bundleCount >= 4) {
                barText.innerHTML = `🚀 <strong>20% SQUAD DISCOUNT + FREE DELIVERY UNLOCKED!</strong>`;
                barText.style.color = "#25d366";
            } else if (count >= 2 && bundleCount < 2) {
                barText.innerHTML = `✅ <strong>FREE DELIVERY UNLOCKED!</strong>`;
                barText.style.color = "#25d366";
            }
        } else {
            bar.classList.remove('active');
        }
    }

    // UPDATE CART MODAL PROGRESS BAR
    const modalProgText = document.getElementById('modalProgressText');
    const modalProgBar = document.getElementById('modalProgressBar');
    
    if (modalProgText && modalProgBar) {
        if (count === 0) {
            modalProgText.innerHTML = "Add items to unlock rewards!";
            modalProgBar.style.width = "0%";
        } else if (count === 1) {
            modalProgText.innerHTML = `⚠️ Add 1 more item for 10% OFF + FREE Delivery!`;
            modalProgText.style.color = "#ff6f00";
            modalProgBar.style.width = "25%";
        } else if (bundleCount >= 2 && bundleCount < 4) {
            let needed = 4 - bundleCount;
            modalProgText.innerHTML = `✅ 10% OFF + FREE Delivery! Add ${needed} more for 20% OFF!`;
            modalProgText.style.color = "#25d366";
            modalProgBar.style.width = "50%";
        } else if (bundleCount >= 4) {
            modalProgText.innerHTML = `🚀 20% SQUAD DISCOUNT + FREE Delivery UNLOCKED!`;
            modalProgText.style.color = "#25d366";
            modalProgBar.style.width = "100%";
        } else if (count >= 2 && bundleCount < 2) {
            modalProgText.innerHTML = `✅ FREE Delivery UNLOCKED! Add bundle items for discounts.`;
            modalProgText.style.color = "#25d366";
            modalProgBar.style.width = "50%";
        }
    }
}

// LIVE GOOGLE SHEET COUPON VALIDATION FUNCTION
async function applyCoupon() {
    const code = document.getElementById('couponCode').value.toUpperCase().trim();
    sfx('click');
    
    if (!code) {
        sfx('error');
        alert("⚠️ Please enter a coupon code.");
        return;
    }

    // Check predefined fixed coupons first
    if (coupons[code]) {
        if (subtotal <= 800) { 
            sfx('error'); 
            alert("⚠️ Minimum order of ₹800 required."); 
            return; 
        }
        sfx('success'); 
        activeCoupon = coupons[code]; 
        alert("✅ Code Applied!"); 
        calculateTotals();
        return;
    }

    // Otherwise, check against live Google Sheet database via Web App URL
    const applyBtn = document.querySelector('.coupon-btn');
    if(applyBtn) { applyBtn.innerText = "CHECKING..."; applyBtn.disabled = true; }

    try {
        const response = await fetch(SCRIPT_URL + '?action=validate&code=' + encodeURIComponent(code));
        const data = await response.json();

        if (applyBtn) { applyBtn.innerText = "APPLY"; applyBtn.disabled = false; }

        if (data.status === 'valid') {
            sfx('success');
            activeCoupon = data.discountPercent; // e.g., 30 for 30% off, or custom parsed value
            alert(`✅ VIP Code Applied Successfully! (${data.discountPercent}% OFF)`);
            calculateTotals();
        } else {
            sfx('error');
            alert("❌ " + (data.message || "Invalid or Expired Code"));
            activeCoupon = 0;
            calculateTotals();
        }
    } catch (err) {
        if (applyBtn) { applyBtn.innerText = "APPLY"; applyBtn.disabled = false; }
        console.error("Coupon validation error:", err);
        sfx('error');
        alert("❌ Error validating code. Please try again.");
    }
}

// AUTOMATIC URL PARAMETER COUPON INTERCEPTOR ON PAGE LOAD
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const discountCode = urlParams.get('discount');
    
    if (discountCode) {
        // Automatically put code into input field and trigger validation after inventory loads
        setTimeout(() => {
            const couponInput = document.getElementById('couponCode');
            if (couponInput) {
                couponInput.value = discountCode;
                // Open cart modal so user sees the discount applied automatically
                openCart();
                applyCoupon();
            }
        }, 1000);
    }
});

// ==========================================
// 6. POPUPS & SLIDER
// ==========================================
const productDetails = {
    milkyway: { title: "Milkyway Explorer", desc: "Silky smooth White Chocolate infused with pure Vanilla.", images: ["images/milkyway.jpg", "images/milkyway_pack.jpg", "images/milkyway_usp.jpg", "images/milkyway_benefit.jpg", "images/milkyway_ing.jpg", "images/milkyway_nutri.jpg"] },
    darkmatter: { title: "Dark Matter (70%)", desc: "Intense 70% Dark Chocolate with deep cocoa notes. Vegan.", images: ["images/darkmatter.jpg", "images/darkmatter_pack.jpg", "images/darkmatter_usp.jpg", "images/darkmatter_benefit.jpg", "images/darkmatter_ing.jpg", "images/darkmatter_nutri.jpg"] },
    asteroid: { title: "Asteroid Crunch", desc: "Creamy Milk Chocolate loaded with jagged roasted Almond rocks.", images: ["images/asteroid.jpg", "images/asteroid_pack.jpg", "images/asteroid_usp.jpg", "images/asteroid_benefit.jpg", "images/asteroid_ing.jpg", "images/asteroid_nutri.jpg"] },
    nebula: { title: "Nebula Swirl", desc: "A galaxy of golden butterscotch Caramel and Sea Salt.", images: ["images/nebula.jpg", "images/nebula_pack.jpg", "images/nebula_usp.jpg", "images/nebula_benefit.jpg", "images/nebula_ing.jpg", "images/nebula_nutri.jpg"] },
    velvet: { title: "Velvet Comet", desc: "50% Semi-Sweet Chocolate. The perfect balance.", images: ["images/velvet.jpg", "images/velvet_pack.jpg", "images/velvet_usp.jpg", "images/velvet_benefit.jpg", "images/velvet_ing.jpg", "images/velvet_nutri.jpg"] },
    smooth: { title: "Smooth Astro", desc: "Classic 35% Milk Chocolate. Rich, creamy, and nostalgic.", images: ["images/smooth.jpg", "images/smooth_pack.jpg", "images/smooth_usp.jpg", "images/smooth_benefit.jpg", "images/smooth_ing.jpg", "images/smooth_nutri.jpg"] },
    celestial: { 
        title: "Celestial Luxury Edition", 
        desc: "A curated quartet of artisan masterpieces. Two bestsellers paired with two exclusive unreleased flavors and a bespoke love letter. A journey written in the stars.", 
        images: ["images/celestial_box.jpg", "images/celestial_open.jpg"] 
    }
};

const fallbacks = ["https://images.unsplash.com/photo-1548142813-c3a8350e941b?w=600", "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600"];

let currentProduct = "", slideIndex = 0;
const slideCaptions = ["MAIN VIEW", "PACKAGING", "UNIQUE FEATURES", "BENEFITS", "INGREDIENTS", "NUTRITION INFO"];

function openProduct(pid) {
    sfx('click'); currentProduct = pid; slideIndex = 0;
    const data = productDetails[pid];
    document.getElementById('productTitle').innerText = data.title;
    document.getElementById('productDesc').innerText = data.desc;
    updateSlide();
    document.getElementById('productModal').classList.add('open');
}

function closeProduct() { sfx('click'); document.getElementById('productModal').classList.remove('open'); }

function changeSlide(direction) {
    sfx('tick'); 
    slideIndex += direction;
    const maxImages = productDetails[currentProduct].images.length;
    if(slideIndex >= maxImages) slideIndex = 0; 
    if(slideIndex < 0) slideIndex = maxImages - 1;
    updateSlide();
}

function updateSlide() {
    const imgEl = document.getElementById('sliderImage');
    const data = productDetails[currentProduct];
    if (data && data.images && data.images[slideIndex]) imgEl.src = data.images[slideIndex];
    else imgEl.src = fallbacks[0];
    
    imgEl.onerror = function() { this.src = fallbacks[0]; };
    
    const captionEl = document.getElementById('slideCaption');
    if(captionEl) {
        if (currentProduct === 'celestial') {
            captionEl.innerText = slideIndex === 0 ? "OUTSIDE BOX" : "INSIDE BOX";
        } else {
            captionEl.innerText = slideCaptions[slideIndex] || "VIEW";
        }
    }
}

// ==========================================
// 7. CHECKOUT & PAYMENT
// ==========================================
function openCart() {
    sfx('click');
    const list = document.getElementById('cartItems'); list.innerHTML = "";
    let hasItems = false;
    for(let k in cart) {
        if(cart[k] > 0) {
            hasItems = true;
            list.innerHTML += `<div style="display:flex; justify-content:space-between; border-bottom:1px solid #333; padding:10px 0;"><div><strong>${names[k]}</strong><br><small>Qty: ${cart[k]}</small></div><div>₹${cart[k]*products[k]}</div></div>`;
        }
    }
    
    if (hasItems && typeof fbq !== 'undefined') {
        fbq('track', 'InitiateCheckout', { value: finalTotal, currency: 'INR' });
    }

    if(!hasItems) list.innerHTML = "<p style='text-align:center'>Cart is empty.</p>";
    document.getElementById('cartOverlay').classList.add('open');
}

function closeCart() { sfx('click'); document.getElementById('cartOverlay').classList.remove('open'); }

function startPayment() {
    sfx('click');
    const name = document.getElementById('name').value;
    const phone = document.getElementById('phone').value;
    const address = document.getElementById('address').value;
    const email = document.getElementById('email').value;
    const pincode = document.getElementById('pincode').value; 

    if (finalTotal === 0) { sfx('error'); alert("Cart is empty."); return; }
    if (!name || !phone || !address || !email || !pincode) { sfx('error'); alert("⚠️ Please fill all details."); return; }
    if (pincode.length !== 6) { sfx('error'); alert("⚠️ Please enter a 6-digit Pincode."); return; }

    const fullAddress = `${address} - Pincode: ${pincode}`;
    logOrderToSheet("Pending", fullAddress); 

    var options = {
        "key": RAZORPAY_KEY, 
        "amount": finalTotal * 100, 
        "currency": "INR", 
        "name": "Choco-Naut",
        "handler": function (response){
            sfx('success'); 
            if (typeof fbq !== 'undefined') fbq('track', 'Purchase', { value: finalTotal, currency: 'INR' });
            if (typeof gtag !== 'undefined') gtag('event', 'purchase', { value: finalTotal, currency: 'INR', transaction_id: response.razorpay_payment_id });
            paymentId = response.razorpay_payment_id; 
            logOrderToSheet("Confirmed", fullAddress); 
            generateInvoice(name, phone, fullAddress);
        },
        "prefill": { "name": name, "contact": phone, "email": email }, 
        "theme": { "color": "#ffc107" }
    };
    var rzp1 = new Razorpay(options); 
    rzp1.open();
}

function generateInvoice(name, phone, address) {
    document.getElementById('cartOverlay').classList.remove('open');
    document.getElementById('invoiceId').innerText = "#INV-" + Math.floor(Math.random() * 1000000);
    document.getElementById('invName').innerText = name;
    document.getElementById('invPhone').innerText = phone;
    document.getElementById('invAddr').innerText = address;

    const tbody = document.getElementById('invoiceItems'); tbody.innerHTML = "";
    for(let k in cart) {
        if(cart[k] > 0) tbody.innerHTML += `<tr><td>${names[k]}</td><td>${cart[k]}</td><td>₹${cart[k]*products[k]}</td></tr>`;
    }
    
    document.getElementById('invSub').innerText = '₹' + subtotal;
    document.getElementById('invDisc').innerText = '-₹' + discount;
    document.getElementById('invDel').innerText = deliveryCharge === 0 ? 'FREE' : '₹' + deliveryCharge;
    document.getElementById('invTotal').innerText = '₹' + finalTotal;
    document.getElementById('invoiceModal').classList.add('open');
}

function sendWhatsApp() {
    sfx('click');
    const name = document.getElementById('invName').innerText;
    const address = document.getElementById('invAddr').innerText;
    let msg = `*🚀 ORDER: Choco-Naut* %0APID: ${paymentId}%0A`;
    for(let k in cart) if(cart[k]>0) msg += `📦 ${names[k]} x ${cart[k]}%0A`;
    msg += `🚚 Delivery: ${deliveryCharge === 0 ? 'FREE' : '₹'+deliveryCharge}%0A`;
    msg += `💰 PAID: ₹${finalTotal}%0A👤 ${name}%0A📍 ${address}`;
    window.open(`https://wa.me/917678107458?text=${msg}`, '_blank');
}

function redirectToHome() {
    sfx('click');
    window.location.reload();
}
