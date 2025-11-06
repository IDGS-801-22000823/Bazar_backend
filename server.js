const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const { getDatabase } = require('firebase-admin/database');

const app = express();
const PORT = process.env.PORT || 3001; 

// CONFIGURACIÓN DE FIREBASE
const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
};


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL 
});

const db = getDatabase(); 

// Middleware
app.use(cors()); 
app.use(express.json()); 

const PRODUCTS_NODE = '/'; 
const SALES_NODE = 'sales'; 

// Convierte el Snapshot de RTDB en un Array
function snapshotToArray(snapshot) {
    const arr = [];
    snapshot.forEach((childSnapshot) => {
        arr.push({ id: childSnapshot.key, ...childSnapshot.val() });
    });
    return arr;
}

// busqueda (GET /api/items?q=:query)
app.get('/api/items', async (req, res) => {
    const queryTerm = req.query.q ? req.query.q.toLowerCase() : '';
    
    try {
        const productsRef = db.ref(PRODUCTS_NODE);
        const snapshot = await productsRef.once('value'); 
        
        let allProducts = snapshot.val()?.products || []; 
        
        const filteredItems = allProducts.filter(product => {
            if (!product) return false;
            const titleMatch = product.title && product.title.toLowerCase().includes(queryTerm);
            const descriptionMatch = product.description && product.description.toLowerCase().includes(queryTerm);
            return titleMatch || descriptionMatch;
        }).map(p => ({
            id: p.id,
            title: p.title,
            description: p.description,
            price: p.price,
            category: p.category,
            rating: p.rating,
            thumbnail: p.thumbnail 
        }));

        res.json({
            items: filteredItems,
            total: filteredItems.length
        });

    } catch (error) {
        console.error("Error al buscar productos:", error);
        res.status(500).json({ message: 'Error interno del servidor al buscar productos.' });
    }
});

// detalle de item por ID (GET /api/items/:id)

app.get('/api/items/:id', async (req, res) => {
    const itemId = parseInt(req.params.id); 

    try {
        const productsRef = db.ref(PRODUCTS_NODE);
        const snapshot = await productsRef.once('value');
        let allProducts = snapshot.val()?.products || [];

        const item = allProducts.find(p => p && p.id === itemId);
        
        if (item) {
            res.json(item); 
        } else {
            res.status(404).json({ message: 'Producto no encontrado' });
        }

    } catch (error) {
        console.error("Error al obtener detalle del producto:", error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

// Venta (POST /api/addSale)
app.post('/api/addSale', async (req, res) => {
    const { productId, quantity = 1, productTitle, price } = req.body;
    
    if (!productId || !productTitle || typeof price !== 'number') {
        return res.status(400).json({ success: false, message: 'Datos de producto incompletos para la venta.' });
    }

    try {
        const newSale = {
            productId: productId,
            productTitle: productTitle,
            price: price,
            quantity: quantity,
            totalAmount: price * quantity,
            purchaseDate: new Date().toISOString(), 
            userId: req.header('X-User-ID') || `guest-${Date.now()}`
        };

        const pushRef = db.ref(SALES_NODE).push();
        await pushRef.set(newSale);

        res.json({ 
            success: true, 
            message: 'Venta registrada con éxito', 
            saleId: pushRef.key,
            sale: newSale 
        }); 

    } catch (error) {
        console.error("Error al registrar la venta:", error);
        res.status(500).json({ success: false, message: 'Error interno del servidor al registrar la venta.' });
    }
});


// lista de Ventas Registradas (GET /api/sales/)

app.get('/api/sales', async (req, res) => {
    try {
        const salesRef = db.ref(SALES_NODE);
        const snapshot = await salesRef.once('value');
        
        let sales = snapshotToArray(snapshot); 

        sales.sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate));

        res.json({ sales: sales, total: sales.length }); 

    } catch (error) {
        console.error("Error al obtener las ventas:", error);
        res.status(500).json({ message: 'Error interno del servidor al obtener ventas.' });
    }
});

// Inicia el servidor
app.listen(PORT, () => {
    console.log(`Servidor API RESTful escuchando en el puerto ${PORT}`);
});