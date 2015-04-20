# mongodb-top

[![build status](https://secure.travis-ci.org/mongodb-js/mongodb-top.png)](http://travis-ci.org/mongodb-js/mongodb-top)

Consume mongotop as a stream.

## Example

```javascript
var mongodb = require('mongodb');
var top = require('mongodb-top');
mongodb.connect('mongodb://localhost:27017', function(err, db){
  top(db).pipe(process.stdout);
});
```

## License

Apache 2
