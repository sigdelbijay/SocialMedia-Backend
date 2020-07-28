const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const axios = require('axios');

const app = express();
const router = express.Router();

//image uploads
const multer  = require('multer')
const upload = multer({ dest: 'uploads/' })

const dbConnector = require('./database-connector');
const { RSA_NO_PADDING } = require('constants');
const { time } = require('console');
const { ObjectId } = require('mongodb');
const keys = require('./keys.json');
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
    results['state'] = '5';
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
    const notifications = await app.locals.db.collection('Notifications').insertOne({notificationTo: profileId, notificationFrom: userId, type: '4', notificationTime: Date.now(), postId: '0'});

    //sending notification
    senderInfo = await getUserInfo(userId);
    receiverInfo = await getUserInfo(profileId);
    const title = "New Friend Request"; 
    const body = `${senderInfo.name} send you friend request`;
    const userToken = receiverInfo.userToken;
    sendNotification(userToken, title, body);
    res.status(200).json(requests && notifications?1:0);
}

async function getUserInfo(userId) {
    return await app.locals.db.collection('Users').findOne({_id: userId});
}

async function acceptRequest(userId, profileId, res) {
    const friend1 = await app.locals.db.collection('Friends').insertOne({userId, profileId, friendOn: Date.now()});
    const friend2 = await app.locals.db.collection('Friends').insertOne({userId: profileId, profileId: userId, friendOn: Date.now()});
    const notification = await app.locals.db.collection('Notifications').insertOne({notificationTo: profileId, notificationFrom:userId, type: '5', notificationTime: Date.now(), postId: '0'});

    if(friend1 && friend2 && notification) {
        const deleteRequest1 = await app.locals.db.collection('Requests').deleteOne({sender: userId, receiver:profileId});
        const deleteRequest2 = await app.locals.db.collection('Requests').deleteOne({sender: profileId, receiver:userId});

        //sending notification
        senderInfo = await getUserInfo(userId);
        receiverInfo = await getUserInfo(profileId);
        const title = "Friend Request Accepted"; 
        const body = `${senderInfo.name} accepted your friend request`;
        const userToken = receiverInfo.userToken;
        sendNotification(userToken, title, body);
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
    const statusImage = req.file?"http://54.253.98.145:8000/" + req.file.filename:"";
    const results = await app.locals.db.collection('Posts').insertOne({ post: body.post, postUserId: body.postUserId, 
        statusImage, statusTime: Date.now(), likeCount: 0, hasComment: 0, commentCount: 0, privacy: body.privacy});

    if(body.privacy == "0") {
        const friends = await app.locals.db.collection("Friends").find({userId: body.postUserId}).toArray();
        for(let item of friends) {
            app.locals.db.collection("Timeline").insertOne({whoseTimeLine: item.profileId, postId: results.ops[0]._id, statusTime: results.ops[0].statusTime});
        }
    }
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

//user
router.route('/profiletimeline').get(async function(req, res) {
    console.log(req.originalUrl);
    const currentState = req.query.current_state;
    let uid, profileId;
    if(currentState ==5) {
        uid = req.query.uid;
    }else {
        uid = req.query.uid;
        profileId = req.query.profileId;
    }
    const skip = parseInt(req.query.offset);
    const limit = parseInt(req.query.limit);

    /* privacy level flags
        0 -> friend privacy level
        1 -> only me privacy level
        2 -> public privacy level
    */

    /*
     * 1 = two people are friends
     * 2 = this person has sent friend request to another friend
     * 3 = this person has received friend request from another friend
     * 4 = people are unknown
     * 5 = own profile
     * */

    let results, userInfo;
    const sort = {'_id': -1}
    if(currentState == 5) {
        results = await app.locals.db.collection('Posts').find({postUserId: uid}).skip(skip).limit(limit).sort(sort).toArray();
        userInfo = await app.locals.db.collection('Users').findOne({_id: uid});
    } else if(currentState == 4) {
        results = await app.locals.db.collection('Posts').find({postUserId: profileId, privacy: '2'}).skip(skip).limit(limit).sort(sort).toArray();
        userInfo = await app.locals.db.collection('Users').findOne({_id: profileId});
    } else if(currentState == 1) {
        results = await app.locals.db.collection('Posts').find({postUserId: profileId, privacy: {$in: ['0', '2']}}).skip(skip).limit(limit).sort(sort).toArray();
        userInfo = await app.locals.db.collection('Users').findOne({_id: profileId});
    } else {
        results = await app.locals.db.collection('Posts').find({postUserId: profileId, privacy: '2'}).skip(skip).limit(limit).sort(sort).toArray();
        userInfo = await app.locals.db.collection('Users').findOne({_id: profileId});
    }

    for(let item of results) {
        item['name'] = userInfo.name;
        item['userProfile'] = userInfo.profileUrl;
        item['userToken'] = userInfo.userToken;

        const checkLike = await app.locals.db.collection("UserPostLikes").findOne({likeBy: uid, postOn: item._id});
        item['isLiked'] = checkLike?true:false;
    }
    res.status(200).send(results);
})

router.route('/gettimelinepost').get(async function(req, res) {
    console.log(req.originalUrl);
    const uid = req.query.uid;
    const skip = parseInt(req.query.offset);
    const limit = parseInt(req.query.limit);
    const sort = {'_id': -1}

    const timeline = await app.locals.db.collection('Timeline').find({whoseTimeLine: uid}).sort(sort).skip(skip).limit(limit).toArray();
    const postIds = timeline.map(x => x.postId);
    const posts = await app.locals.db.collection('Posts').find({_id: {$in: postIds}}).sort(sort).toArray();
    for(let post of posts) {
        const user = await app.locals.db.collection('Users').findOne({_id: post.postUserId});
        post.name = user.name;
        post.userProfile = user.profileUrl;
        post.userToken = user.userToken;

        const checkLike = await app.locals.db.collection("UserPostLikes").findOne({likeBy: uid, postOn: post._id});
        post['isLiked'] = checkLike?true:false;
    }
    res.status(200).send(posts);

})

router.route('/likeunlike').post(async function(req, res) {
    console.log(req.originalUrl);
    const userId = req.body.userId;
    const contentId = ObjectId(req.body.postId);
    const contentOwnerId = req.body.contentOwnerId;
    const operationType = req.body.operationType;

    if(operationType == 1) {

        const posts = await app.locals.db.collection('Posts').updateOne({_id: contentId}, {$inc: {likeCount: 1}});
        const userPostLike = await app.locals.db.collection('UserPostLikes').insertOne({likeBy: userId, postOn: contentId});
        if(posts && userPostLike) {
            if(userId != contentOwnerId) {
                const notifications = await app.locals.db.collection("Notifications").insertOne({notificationTo: contentOwnerId, notificationFrom: userId, type: operationType, notificationTime: Date.now(), postId: contentId});
                
                //sending notification
                senderInfo = await getUserInfo(userId);
                receiverInfo = await getUserInfo(contentOwnerId);
                const title = "New Like"; 
                const body = `${senderInfo.name} liked your post`;
                const userToken = receiverInfo.userToken;
                sendNotification(userToken, title, body);
            }
            //TODO: returning posts for now. same for else case
            const likeCount = await app.locals.db.collection('Posts').findOne({_id: contentId});
            res.status(200).json(likeCount);
        }
    } else {
        const posts = await app.locals.db.collection('Posts').updateOne({_id: contentId}, {$inc: {likeCount: -1}});
        const userPostLike = await app.locals.db.collection('UserPostLikes').deleteOne({likeBy: userId, postOn: contentId});
        if(posts && userPostLike) {
            if(userId != contentOwnerId) {
                const notifications = await app.locals.db.collection("Notifications").deleteOne({notificationTo: contentOwnerId, notificationFrom: userId});
            }
            const likeCount = await app.locals.db.collection('Posts').findOne({_id: contentId});
            res.status(200).json(likeCount.likeCount);
        }
    }
})

router.route('/postcomment').post(async function(req, res) {
    console.log(req.originalUrl);
    let results = [];
    const comment = req.body.comment;
    const commentBy = req.body.commentBy;

    //user commeting on a post -> 0
    //user replying on a comment -> 1
    const level = req.body.level;

    // user commenting to a post -> 0
    // user replying to a comment -> postId
    const superParentId = level == 0? "": ObjectId(req.body.superParentId);

    //user commeting to a post -> postId
    //user replying to a comment -> commentId
    const parentId = ObjectId(req.body.parentId);

    //flag to tell comment has child comments or not
    //default is 0
    const hasSubComment = req.body.hasSubComment;

    //id of post owner
    const postUserId = req.body.postUserId;

    //if user replying to a comment than this is userId of comment owner
    const commentUserId = req.body.commentUserId;

    const commentData = await app.locals.db.collection("Comments").insertOne({comment, commentBy, commentDate: Date.now(), superParentId, parentId, hasSubComment, level});
    const cid = ObjectId(commentData.insertedId);
    let postUpdate, commentUpdate;
    if(level == 0) postUpdate = await app.locals.db.collection("Posts").updateOne({_id: parentId}, {$set: {hasComment: 1}, $inc: {commentCount: 1}});
    else {
        postUpdate = await app.locals.db.collection("Posts").updateOne({_id: superParentId}, {$inc: {commentCount: 1}});
        commentUpdate = await app.locals.db.collection("Comments").updateOne({_id: parentId}, {$set: {hasSubComment: 1}});
    }

    //get commented data
    let commentsGet, user;
    if(level == 0) {
        commentsGet = await app.locals.db.collection("Comments").findOne({parentId, _id: cid});
        user = await app.locals.db.collection("Users").findOne({_id: commentsGet.commentBy});
        commentsGet.name = user.name;
        commentsGet.profileUrl = user.profileUrl;
        commentsGet.userToken = user.userToken;
    } else { //get subcommented data
        commentsGet = await app.locals.db.collection("Comments").findOne({parentId, _id: cid, superParentId});
        user = await app.locals.db.collection("Users").findOne({_id: commentsGet.commentBy});
        commentsGet.name = user.name;
        commentsGet.profileUrl = user.profileUrl;
        commentsGet.userToken = user.userToken;
    }

    //notify that someone comment on your post
    const updatePostId = level == 0 ? parentId: superParentId;
    if(postUserId !== commentBy) {
        app.locals.db.collection("Notifications").insertOne({notificationTo: postUserId, notificationFrom: commentBy, type: 2, notificationTime: Date.now(), postId: updatePostId});

        //sending notification
        senderInfo = await getUserInfo(commentBy);
        receiverInfo = await getUserInfo(postUserId);
        const title = "New Comment"; 
        const body = `${senderInfo.name} commented on your post`;
        const userToken = receiverInfo.userToken;
        sendNotification(userToken, title, body);
    }

    //notify that someone replied on your comment
    if(level == 1)
        app.locals.db.collection("Notifications").insertOne({notificationTo: commentUserId, notificationFrom: commentBy, type: 3, notificationTime: Date.now(), postId: superParentId});

    results.push({comment: commentsGet, subComments: {total: 0, lastComment: []}});

    res.status(200).json({results});

});

router.route('/retrievetopcomment').get(async function(req, res) {
    console.log(req.originalUrl);
    const results = [];
    const postId = ObjectId(req.query.postId);
    const sort = {_id: -1};
    const postComments = await app.locals.db.collection('Comments').find({level: "0", parentId: postId}).sort(sort).toArray();
    for(let comment of postComments) {
        const userDetail = await app.locals.db.collection('Users').findOne({_id: comment.commentBy});
        comment.name = userDetail.name;
        comment.profileUrl = userDetail.profileUrl;
        comment.userToken = userDetail.userToken;

        let subComments = {};
        subComments['lastComment'] = [];
        subComments['total'] = 0;
        if(comment.hasSubComment == 1) {
            subComments['lastComment'] = await app.locals.db.collection('Comments').find({level: "1", parentId: ObjectId(comment._id), superParentId: postId}).project({_id: 0, superParentId:0, parentId:0, hasSubComment:0, level:0}).sort(sort).limit(1).toArray();
            const commentUserDetail = await app.locals.db.collection('Users').findOne({_id: subComments.lastComment[0].commentBy});
            subComments['lastComment'][0]['name'] = commentUserDetail.name; 
            subComments['lastComment'][0]['profileUrl'] = commentUserDetail.profileUrl;

            subComments['total'] = await app.locals.db.collection('Comments').find({level: "1", parentId: ObjectId(comment._id), superParentId: postId}).count();
        }

        results.push({comment, subComments});
    }  
    res.status(200).json({results});

})

router.route('/retrievelowlevelcomment').get(async function(req, res) {
    console.log(req.originalUrl);
    const results = [];
    const postId = ObjectId(req.query.postId);
    const commentId = ObjectId(req.query.commentId);
    const sort = {_id: -1}
    const comments = await app.locals.db.collection('Comments').find({level: "1", parentId: commentId, superParentId: postId}).sort(sort).toArray();
    for(let comment of comments) {
        const userDetail = await app.locals.db.collection('Users').findOne({_id: comment.commentBy});
        comment.name = userDetail.name;
        comment.profileUrl = userDetail.profileUrl;
        comment.userToken = userDetail.userToken;
    }
    res.status(200).json(comments);

})

router.route('/getnotification').get(async function(req, res) {
    console.log(req.originalUrl);
    const userId = req.query.uid;
    const sort = {_id: -1}
    const notifications = await app.locals.db.collection('Notifications').find({notificationTo: userId}).sort(sort).toArray();
    for(let notification of notifications) {
        let userDetail = await app.locals.db.collection('Users').findOne({_id: notification.notificationFrom});
        let postDetail;
        if(notification.postId) postDetail = await app.locals.db.collection('Posts').findOne({_id: ObjectId(notification.postId)});
        notification.name = userDetail.name;
        notification.profileUrl = userDetail.profileUrl;
        notification.post = postDetail ? postDetail.post : "";
    }
    res.status(200).json(notifications);
})

router.route('/notification/postdetails').get(async function(req, res) {
    console.log(req.originalUrl);
    const postId = ObjectId(req.query.postId);
    const userId = req.query.uid;
    const post = await app.locals.db.collection('Posts').findOne({_id: postId});
    const userDetail = await app.locals.db.collection('Users').findOne({_id: post.postUserId});
    post.name = userDetail.name;
    post.userProfile = userDetail.profileUrl;
    post.userToken = userDetail.userToken;
    const checkLike = await app.locals.db.collection("UserPostLikes").findOne({likeBy: userId, postOn: post._id});
        post['isLiked'] = checkLike?true:false;
    res.status(200).json(post);

})

//sending notifications
function sendNotification(userToken, title, body) {
    const clickAction = "com.example.socialmedia";
    const msg = { body, title, icon: 'default', sound: 'default', clickAction, isFromNotification: "true"};
    const fields = { to: userToken, notification: msg };
    const options = {
        url: "https://fcm.googleapis.com/fcm/send",
        method: 'post',
        headers: {
            'content-type': 'application/json',
            'Authorization': `key=${keys.FIREBASE_API_ACCESS_KEY}`
        },
        data: fields
    }
    axios(options);
}

//sending notifications to user from server
// router.route('/notification/send').post(async function(req, res) {
//     console.log(req.originalUrl);
//     sendNotification("cE6LoqgDTwOXp-eZNE9xNQ:APA91bFvwNSw8EUg2gwQVGHOwVCPhWlgSrxXzCyqmx3y-n-ouSz1TKTepU9lqxYqBVAwFs3bTE6dZTna3hOowkurN3HArQtki2p9x_H0YuADxtRTuEkdQmaLBelquDgGny55Xyjx80Rs",
//         "From node.js", "this is a notificaiton from node.js");
// });

module.exports = app;

