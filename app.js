const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const router = express.Router();

//image uploads
const multer  = require('multer')
const upload = multer({ dest: 'uploads/' })

const dbConnector = require('./database-connector');
// const relation = require('./realtionship');

dbConnector.init(app);
// relation.init(app);

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
// app.get("/", express.static(path.join(__dirname, "./uploads")));
app.use(express.static(path.join(__dirname, "./uploads")));


app.use('/app', router);
router.route('/').get(function(req, res) {
    console.log(req.originalUrl);
    res.status(200).send("Successful");
});

router.route('/login').post(async function(req, res) {
    console.log(req.originalUrl);
    const body = req.body;
    // if (Object.keys(body).length === 0) res.status(400).send("Invalid parameters");
    const results = await app.locals.db.collection('Users').findOne({_id: body.uid});
    if(results) {
        app.locals.db.collection('Users').updateOne({_id:body.uid}, {$set: {userToken: body.userToken}});
    }
    else {
        app.locals.db.collection('Users').insertOne({_id: body.uid, name: body.name, email: body.email, profileUrl:body.profileUrl, coverUrl:body.coverUrl, userToken:body.userToken});
    }
    res.status(200).json(results?true:false);
});

router.route('/loadownprofile').get(async function(req, res) {
    console.log(req.originalUrl);
    const uid = req.query.uid;
    const results = await app.locals.db.collection('Users').findOne({_id: uid});
    if(results) res.status(200).send(results);
    // else res.status(401).send("Invalid user");
});

router.route('/poststatus').post(upload.single('image'), async function(req, res) {
    console.log(req.originalUrl);
    const body = req.body;
    const results = await app.locals.db.collection('Posts').insertOne({ post: body.post, postUserId: body.postUserId, 
        statusImage: req.file.filename, statusTime: Date.now(), likeCount: 0, hasComment: 0, privacy: body.privacy});
    res.status(200).json(results?1:0);

})

router.route('/uploadImage').post(upload.single('image'), async function(req, res) {
    console.log(req.originalUrl);
    let body = req.body;
    let results;
    const statusImage = "http://10.0.2.2:8000/" + req.file.filename;
    if(body.imageUploadType == 0)
        results = await app.locals.db.collection('Users').updateOne({ _id: body.postUserId}, {$set: {profileUrl: statusImage}});
    else
        results = await app.locals.db.collection('Users').updateOne({ _id: body.postUserId}, {$set: {coverUrl: statusImage}});
    res.status(200).json(results?1:0);
})

router.route('/search').get(async function(req, res) {
    console.log(req.originalUrl);
    let keyword = req.query.keyword;
    const results = await app.locals.db.collection('Users').find({name: {$regex: keyword, $options: 'i'}}).toArray();
    console.log("results", results);
    res.status(200).json(results);
})

module.exports = app;

