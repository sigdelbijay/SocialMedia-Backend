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
const { RSA_NO_PADDING } = require('constants');
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

router.route('/loadotherprofile').get(async function(req, res) {
    console.log(req.originalUrl);
    const userId = req.query.uid;
    const profileId = req.query.profileId;
    const results = await app.locals.db.collection('Users').findOne({_id: profileId});
    let current_state = "0";
    let request = await checkRequest(userId, profileId);
    if(request) {
        if(request['sender'] == userId) {
            //request is send otherwise received
            current_state = "2";
        } else current_state = "3";
    } else {
        const friend = await checkFriend(userId, profileId);
        if(friend) {
            current_state = "1";
        } else current_state = "4";
    }

    results["state"] = current_state;
    console.log("results returned: -", results);
    if(results) res.status(200).send(results);
    // else res.status(401).send("Invalid user");
});

async function checkRequest(userId, profileId) {
    const results = await app.locals.db.collection('Requests').findOne({$or: [{sender:userId, receiver:profileId}, {sender:profileId, receiver:userId}]});
    return results;
}

async function checkFriend(userId, profileId) {
    const results = await app.locals.db.collection('Friends').findOne({userId, profileId});
    return results?true:false;
}

async function cancelRequest(userId, profileId, res) {
    const requests = await app.locals.db.collection('Requests').deleteOne({sender: userId, receiver:profileId});
    const notifications = await app.locals.db.collection('Notifications').deleteOne({notificationTo: profileId, notificationFrom:userId});
    res.status(200).json(requests && notifications?1:0);
}

async function sendRequest(userId, profileId, res) {
    const requests = await app.locals.db.collection('Requests').insertOne({sender: userId, receiver: profileId, date: Date.now()});
    const notifications = await app.locals.db.collection('Notifications').insertOne({notificationTo: profileId, notificationFrom: userId, type: '4', notificationTime: Date.now()});
    res.status(200).json(requests && notifications?1:0);
}

async function acceptRequest(userId, profileId, res) {
    const friend1 = await app.locals.db.collection('Friends').insertOne({userId, profileId, friendOn: Date.now()});
    const friend2 = await app.locals.db.collection('Friends').insertOne({userId: profileId, profileId: userId, friendOn: Date.now()});
    const notification = await app.locals.db.collection('Notifications').insertOne({notificationTo: profileId, notificationFrom:userId, type: '5', notificationTime: Date.now(), postId: '0'});

    if(friend1 && friend2 && notification) {
        const deleteRequest1 = await app.locals.db.collection('Requests').deleteOne({sender: userId, receiver:profileId});
        const deleteRequest2 = await app.locals.db.collection('Requests').deleteOne({sender: profileId, receiver:userId});
        res.status(200).json(deleteRequest1 || deleteRequest2 ? 1 : 0);
    }
}

async function unfriend(userId, profileId, res) {
    const deleteFriend1 = await app.locals.db.collection('Friends').deleteOne({userId, profileId});
    const deleteFriend2 = await app.locals.db.collection('Friends').deleteOne({userId: profileId, profileId: userId});
    res.status(200).json(deleteFriend1 && deleteFriend2 ? 1 : 0);
}

router.route('/poststatus').post(upload.single('image'), async function(req, res) {
    console.log(req.originalUrl);
    const body = req.body;
    const statusImage = "http://54.253.98.145:8000/" + req.file.filename;
    const results = await app.locals.db.collection('Posts').insertOne({ post: body.post, postUserId: body.postUserId, 
        statusImage, statusTime: Date.now(), likeCount: 0, hasComment: 0, privacy: body.privacy});
    res.status(200).json(results?1:0);

})

router.route('/uploadImage').post(upload.single('image'), async function(req, res) {
    console.log(req.originalUrl);
    let body = req.body;
    let results;
    const statusImage = "http://54.253.98.145:8000/" + req.file.filename;
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
    res.status(200).json(results);
})

router.route('/performAction').post(async function(req, res) {
    console.log(req.originalUrl);
    let body = req.body;
    if(body.operationType == 1) {
        unfriend(body.userId, body.profileId, res); 
    } else if(body.operationType == 2) {
        cancelRequest(body.userId, body.profileId, res); 
    } else if(body.operationType == 3) {
        acceptRequest(body.userId, body.profileId, res); 
    } else if(body.operationType == 4) {
        sendRequest(body.userId, body.profileId, res);
    }
})

router.route('/loadfriends').get(async function(req, res) {
    let userId = req.query.userId;

    //finding requests
    let requests = await app.locals.db.collection('Requests').find({receiver: userId}).toArray();
    let requestsIds = requests.map(x => x.sender);
    let requestsDetails = await app.locals.db.collection('Users').find({_id: {$in: requestsIds}}).toArray();

    //finding friends
    let friends = await app.locals.db.collection('Friends').find({userId}).toArray();
    let friendsIds = friends.map(x => x.profileId);
    let friendsDetails = await app.locals.db.collection('Users').find({_id: {$in: friendsIds}}).toArray();
    res.status(200).json({'requests': requestsDetails, 'friends': friendsDetails});

})

module.exports = app;

