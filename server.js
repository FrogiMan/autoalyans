const express = require('express');
const app = express();
const port = 3000;
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const session = require('express-session');

app.use(session({
    secret: 'secretKey',
    resave: false,
    saveUninitialized: true,
}));

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/images/BD/uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)); // Уникальное имя файла
    }
});

const upload = multer({ storage: storage });

mongoose.connect('mongodb://localhost:27017/carRental', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const carSchema = new mongoose.Schema({
    brand: String,
    model: String,
    year: Number,
    transmission: String,
    seats: Number,
    class: String,
    price: {
        '1_day': String,
        '3_days': String,
    },
    image: String,
});

const userSchema = new mongoose.Schema({
    name: String,
    surname: String,
    login: String,
    password: String,
    email: String,
    number: String,
    avatar: String,
});

const reservationSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    car: carSchema,
    days: Number,
    date: { type: Date, default: Date.now },
    totalPrice: String,
});

const CarEconomy = mongoose.model('CarEconomy', carSchema, 'cars_economy');
const CarComfort = mongoose.model('CarComfort', carSchema, 'cars_comfort');
const CarBusiness = mongoose.model('CarBusiness', carSchema, 'cars_business');
const User = mongoose.model('User', userSchema);
const Reservation = mongoose.model('Reservation', reservationSchema);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

function checkAuth(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}

app.get('/api/check-auth', (req, res) => {
    if (req.session.userId) {
        res.json({ authenticated: true });
    } else {
        res.json({ authenticated: false });
    }
});

app.get('/rent', (req, res) => {
    res.sendFile(__dirname + '/public/rent.html');
});

app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

app.get('/admin', checkAuth, (req, res) => {
    res.sendFile(__dirname + '/public/admin.html');
});

app.get('/user', checkAuth, (req, res) => {
    res.sendFile(__dirname + '/public/user.html');
});

app.get('/api/profile', checkAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (user) {
            res.json({
                name: user.name,
                surname: user.surname,
                email: user.email,
                number: user.number,
                avatar: user.avatar,
                login: user.login
            });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error fetching user profile' });
    }
});

app.put('/api/profile', checkAuth, upload.single('avatar'), async (req, res) => {
    try {
        const userId = req.session.userId;
        const updateData = {
            name: req.body.name,
            surname: req.body.surname,
            email: req.body.email,
            number: req.body.number,
        };
        if (req.file) {
            updateData.avatar = `/images/BD/uploads/${req.file.filename}`;
        }
        const user = await User.findByIdAndUpdate(userId, updateData, { new: true });
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ error: 'Error updating user profile' });
    }
});

app.post('/api/profile/avatar', checkAuth, upload.single('avatar'), async (req, res) => {
    try {
        const userId = req.session.userId;
        const avatarPath = `/images/BD/uploads/${req.file.filename}`;
        const user = await User.findByIdAndUpdate(userId, { avatar: avatarPath }, { new: true });
        res.json({ success: true, avatar: avatarPath });
    } catch (error) {
        res.status(500).json({ error: 'Error updating avatar' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ message: 'Failed to logout' });
        }
        res.redirect('/login');
    });
});

app.post('/login', async (req, res) => {
    const { login, password } = req.body;

    if (login === 'admin' && password === 'admin') {
        req.session.userId = 'admin';
        req.session.userLogin = 'admin';
        return res.redirect('/admin');
    } else {
        const user = await User.findOne({ login, password });
        if (user) {
            req.session.userId = user._id;
            req.session.userLogin = user.login;
            return res.redirect('/user');
        } else {
            return res.send('Invalid login or password');
        }
    }
});

app.post('/register', async (req, res) => {
    const { name, surname, login, email, number, password } = req.body;

    const newUser = new User({ name, surname, login, email, number, password });
    await newUser.save();

    res.redirect('/login');
});

app.get('/api/cars/:class', async (req, res) => {
    const carClass = req.params.class.toLowerCase(); 
    const searchQuery = req.query.search || '';

    let CarModel;

    switch(carClass) {
        case 'economy':
            CarModel = CarEconomy;
            break;
        case 'comfort':
            CarModel = CarComfort;
            break;
        case 'business':
            CarModel = CarBusiness;
            break;
        default:
            return res.status(400).json({ error: 'Invalid car class' });
    }

    try {
        const searchCriteria = {
            $or: [
                { brand: { $regex: searchQuery, $options: 'i' } },
                { model: { $regex: searchQuery, $options: 'i' } },
                { year: parseInt(searchQuery) || null },
                { seats: parseInt(searchQuery) || null },
                { class: { $regex: searchQuery, $options: 'i' } }
            ].filter(criteria => criteria[Object.keys(criteria)[0]] !== null)
        };

        const cars = await CarModel.find(searchCriteria);
        res.json(cars);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching cars' });
    }
});

app.get('/api/cars', async (req, res) => {
    const searchQuery = req.query.search || '';

    try {
        const searchCriteria = {
            $or: [
                { brand: { $regex: searchQuery, $options: 'i' } },
                { model: { $regex: searchQuery, $options: 'i' } },
                { year: parseInt(searchQuery) || null },
                { seats: parseInt(searchQuery) || null },
                { class: { $regex: searchQuery, $options: 'i' } }
            ].filter(criteria => criteria[Object.keys(criteria)[0]] !== null)
        };

        const carsEconomy = await CarEconomy.find(searchCriteria);
        const carsComfort = await CarComfort.find(searchCriteria);
        const carsBusiness = await CarBusiness.find(searchCriteria);

        const cars = [...carsEconomy, ...carsComfort, ...carsBusiness];
        res.json(cars);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching cars' });
    }
});

app.post('/api/cars', upload.single('image'), async (req, res) => {
    const { brand, model, year, transmission, seats, class: carClass, price_1_day, price_3_days } = req.body;
    const imagePath = req.file ? `../images/BD/uploads/${req.file.filename}` : '';

    let CarModel;

    switch(carClass.toLowerCase()) {
        case 'economy':
            CarModel = CarEconomy;
            break;
        case 'comfort':
            CarModel = CarComfort;
            break;
        case 'business':
            CarModel = CarBusiness;
            break;
        default:
            return res.status(400).json({ error: 'Invalid car class' });
    }

    try {
        const newCar = new CarModel({
            brand,
            model,
            year,
            transmission,
            seats,
            class: carClass,
            price: { '1_day': price_1_day || 'N/A', '3_days': price_3_days || 'N/A' },
            image: imagePath
        });
        await newCar.save();
        res.status(201).json(newCar);
    } catch (error) {
        res.status(500).json({ error: 'Error adding car' });
    }
});

app.put('/api/cars/:id', upload.single('image'), async (req, res) => {
    const carId = req.params.id;
    const { brand, model, year, transmission, seats, class: carClass, price_1_day, price_3_days } = req.body;
    let imagePath;

    if (req.file) {
        imagePath = `../images/BD/uploads/${req.file.filename}`;
    }

    let CarModel;

    switch(carClass.toLowerCase()) {
        case 'economy':
            CarModel = CarEconomy;
            break;
        case 'comfort':
            CarModel = CarComfort;
            break;
        case 'business':
            CarModel = CarBusiness;
            break;
        default:
            return res.status(400).json({ error: 'Invalid car class' });
    }

    try {
        const updatedCar = await CarModel.findByIdAndUpdate(carId, { 
            brand, model, year, transmission, seats, class: carClass, 
            price: { '1_day': price_1_day || 'N/A', '3_days': price_3_days || 'N/A' }, 
            ...(imagePath && { image: imagePath })
        }, { new: true });
        res.json(updatedCar);
    } catch (error) {
        res.status(500).json({ error: 'Error updating car' });
    }
});

app.delete('/api/cars/:id', async (req, res) => {
    const carId = req.params.id;
    const carClass = req.query.class.toLowerCase();

    let CarModel;

    switch(carClass) {
        case 'economy':
            CarModel = CarEconomy;
            break;
        case 'comfort':
            CarModel = CarComfort;
            break;
        case 'business':
            CarModel = CarBusiness;
            break;
        default:
            return res.status(400).json({ error: 'Invalid car class' });
    }

    try {
        await CarModel.findByIdAndDelete(carId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting car' });
    }
});

app.get('/api/cars/:class/:id', async (req, res) => {
    const carClass = req.params.class.toLowerCase();
    const carId = req.params.id;

    let CarModel;

    switch(carClass) {
        case 'economy':
            CarModel = CarEconomy;
            break;
        case 'comfort':
            CarModel = CarComfort;
            break;
        case 'business':
            CarModel = CarBusiness;
            break;
        default:
            return res.status(400).json({ error: 'Invalid car class' });
    }

    try {
        const car = await CarModel.findById(carId);
        res.json(car);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching car' });
    }
});

// Новый маршрут для создания бронирования
app.post('/api/reservations', checkAuth, async (req, res) => {
    const { carId, carClass, days } = req.body;

    let CarModel;

    switch(carClass.toLowerCase()) {
        case 'economy':
            CarModel = CarEconomy;
            break;
        case 'comfort':
            CarModel = CarComfort;
            break;
        case 'business':
            CarModel = CarBusiness;
            break;
        default:
            return res.status(400).json({ error: 'Invalid car class' });
    }

    try {
        const car = await CarModel.findById(carId);
        const price = car.price[`${days}_day`];
        const reservation = new Reservation({
            userId: req.session.userId,
            car,
            days,
            totalPrice: price,
        });
        await reservation.save();

        // Устанавливаем таймер на удаление через 2 минуты
        setTimeout(async () => {
            await Reservation.findByIdAndDelete(reservation._id);
            console.log(`Reservation ${reservation._id} has been deleted after 2 minutes.`);
        }, 120000);

        res.status(201).json(reservation);
    } catch (error) {
        res.status(500).json({ error: 'Error creating reservation' });
    }
});

// Новый маршрут для удаления бронирования
app.delete('/api/reservations/:id', checkAuth, async (req, res) => {
    try {
        const reservationId = req.params.id;
        await Reservation.findByIdAndDelete(reservationId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting reservation' });
    }
});

// Новый маршрут для получения истории бронирований пользователя
app.get('/api/reservations', checkAuth, async (req, res) => {
    try {
        const reservations = await Reservation.find({ userId: req.session.userId });
        res.json(reservations);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching reservations' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
