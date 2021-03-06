/*global Ember*/
/*global DS*/
'use strict';

var fb;

DS.FirebaseModel = DS.Model.extend({
    getRef: function() {
        var name = this.constructor.url,
            ref;

        if(!this.get('id')) {
            ref = fb.child(name).push();
            this.set("id", ref.name());
        } else {
            ref = fb.child(name).child(this.get("id"));
        }

        return ref;

    }
});

DS.FirebaseLiveModel = DS.FirebaseModel.extend({
    init: function() {
        this._super();
        this.on('didLoad', this._initLiveBindings.bind(this));
        this.on('didCreate', this._initLiveBindings.bind(this));
    },
    _initLiveBindings: function() {

        var ref = this.getRef(),
            record = this;

        ref.on("child_added", function(snapshot) {

            record._liveUpdate(snapshot);

            //record.triggerLater('didUpdate', record);
            // This event will be triggered once for each initial child at this location,
            // and it will be triggered again every time a new child is added. The
            // DataSnapshot passed into the callback will reflect the data for the relevant
            // child. For ordering purposes, it is passed a second argument which is a string
            // containing the name of the previous sibling child by priority order (or null
            // if it is the first child.)
        });

        ref.on("child_changed", function(snapshot) {
            record._liveUpdate(snapshot);
        });

        ref.on("child_removed", function(snapshot) {
            record.set(snapshot.name(), null);
        });

    },
    _liveUpdate: function(snapshot) {

        var record = this,
            fieldName = snapshot.name(),
            fieldVal = snapshot.val(),
            relationship = record._isFieldARelationship(fieldName);

        if(relationship && record.get(fieldName).constructor.toString() !== "DS.PromiseArray") {

            snapshot.forEach(function(childSnapshot) {

                var fieldValue = childSnapshot.val(),
                    newObj;

                if(!record._relationshipHasChild(fieldName, fieldValue)) {
                    newObj = record.store.find(relationship.storeType, fieldValue).then(function(val) {
                        record.get(fieldName).pushObject(val);
                    });
                }
            });

        } else {

            if(record.get(fieldName) !== fieldVal) {
                record.set(fieldName, fieldVal);
            }

        }

    },
    _isFieldARelationship: function(fieldName) {

        var isRelationship = false;

        Ember.get(this.constructor, 'relationshipsByName').forEach(function(name, relationship) {
            if(fieldName === name) {
                isRelationship = { storeType: Ember.String.singularize(relationship.type.url) };
            }
        });

        return isRelationship;
    },
    _relationshipHasChild: function(fieldName, fieldValue) {

        var matches = this.get(fieldName).filter(function(field) {
            return field.get('id') === fieldValue;
        });

        return matches.length !== 0;

    },
    deleteRecord: function() {
        this.disableBindings();
        this._super();
    },
    disableBindings: function() {
        var ref = this.getRef();
        this.bindingsDisabled = true;
        ref.off("child_added");
        ref.off("child_changed");
        ref.off("child_removed");
    }
});

DS.FirebaseAdapter = DS.Adapter.extend(Ember.Evented, {

    init: function() {
        this._super();

        if(!this.firebaseURL) {
            throw new Error("DS.FirebaseAdapter must be initialized with a firebaseURL");
        }

        this.fb = new Firebase(this.firebaseURL);
        fb = this.fb;
    },

    fb: undefined,

    find: function (store, type, id) {

        var ref = this._getRefForType(type).child(id);

        return new Ember.RSVP.Promise(function(resolve, reject) {
            ref.once("value", function(snapshot) {
                resolve(snapshot.val());
            }, function(error) { reject(error); });
        });

    },

    findMany: function (store, type, ids) {

        var promises = [],
            find = this.find;

        ids.forEach(function(id) {
            promises.push(this.find(store, type, id));
        }.bind(this))

        return Ember.RSVP.all(promises);
    },

    findQuery: function (store, type, query, recordArray) {
        // TODO
    },

    query: function (records, query) {
        // TODO
        // Firebase does not support querying
        // Will have to build client side querying
    },

    findAll: function (store, type) {

        var ref = this._getRefForType(type);

        return new Ember.RSVP.Promise(function(resolve, reject) {

            ref.once('value', function(snapshot) {

                var results = [];

                snapshot.forEach(function(child) {
                    var data = child.val();
                    data.id = child.name();
                    results.push(Ember.copy(data))
                });

                resolve(results);

            }, function(error) { reject(error); });
        });

    },

    createRecord: function (store, type, record) {

        var ref = record.getRef(),
            data = record.serialize({ includeId: true });

        return new Ember.RSVP.Promise(function(resolve, reject) {
            ref.set(data, function(error) {
                if(error) {
                    reject();
                    throw new Error("Firebase error: ", error);
                } else {
                    resolve();
                }
            });
        });

    },

    updateRecord: function (store, type, record) {

        var ref = record.getRef(),
            data = record.serialize({ includeId: true });

        return new Ember.RSVP.Promise(function(resolve, reject) {

            ref.update(data, function(error) {
                if(error) {
                    reject();
                    throw new Error("Firebase error: ", error);
                } else {
                    resolve();
                }
            });

        });
    },

    deleteRecord: function (store, type, record) {

        var ref = record.getRef();

        return new Ember.RSVP.Promise(function(resolve, reject) {

            ref.set(null, function(error) {

                if(error) {
                    reject();
                    throw new Error("Firebase error: ", error);
                } else {
                    resolve();
                }

            });

        });
    },

    _getRefForType: function(type) {
        return this.fb.child(type.url);
    }
});